#!/usr/bin/env bash

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
APP_DIR="${DSV_SERVER_APP_DIR:-/srv/clever-route-server}"
SERVICE_TAG_KEY="${DSV_SERVER_SSM_TAG_KEY:-Service}"
SERVICE_TAG_VALUE="${DSV_SERVER_SSM_TAG_VALUE:-clever-delivery-server}"
API_BASE_URL="${DSV_API_BASE_URL:-https://clever-route-api.cleversystem.ai}"
VERSION_CODE="${1:-}"
VERSION_NAME="${2:-}"
APK_SHA256="${3:-}"
INSTALL_URL="${4:-}"
MINIMUM_VERSION_CODE="${MINIMUM_SUPPORTED_VERSION_CODE:-}"

fail() {
  printf 'DSV Driver release-state publish failed: %s\n' "$1" >&2
  exit 1
}

for command in aws curl node python3; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

[[ "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'versionCode must be a positive integer'
[[ "$VERSION_NAME" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]] || fail 'versionName contains unsupported characters'
[[ "$APK_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail 'APK SHA-256 is invalid'
[[ "$INSTALL_URL" == https://* ]] || fail 'install URL must use HTTPS'
if [[ -n "$MINIMUM_VERSION_CODE" ]]; then
  [[ "$MINIMUM_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'minimum versionCode must be a positive integer'
  (( MINIMUM_VERSION_CODE <= VERSION_CODE )) || fail 'minimum versionCode exceeds latest versionCode'
fi

read -r TARGET_COUNT INSTANCE_ID PING_STATUS <<EOF_TARGET
$(aws ssm describe-instance-information \
  --region "$AWS_REGION" \
  --filters "Key=tag:${SERVICE_TAG_KEY},Values=${SERVICE_TAG_VALUE}" \
  --query '[length(InstanceInformationList), InstanceInformationList[0].InstanceId, InstanceInformationList[0].PingStatus]' \
  --output text)
EOF_TARGET
[[ "$TARGET_COUNT" == '1' ]] || fail "expected one SSM target; got $TARGET_COUNT"
[[ "$PING_STATUS" == 'Online' ]] || fail "SSM target is not online: $INSTANCE_ID"

export APK_SHA256 APP_DIR INSTALL_URL MINIMUM_VERSION_CODE VERSION_CODE VERSION_NAME
PARAMETERS_PATH="$(mktemp /tmp/clever-driver-release-state.XXXXXX)"
trap 'rm -f "$PARAMETERS_PATH"' EXIT
python3 - "$PARAMETERS_PATH" <<'PY'
import json
import os
import shlex
import sys

args = [
    '--version-code', os.environ['VERSION_CODE'],
    '--version-name', os.environ['VERSION_NAME'],
    '--apk-sha256', os.environ['APK_SHA256'],
    '--install-url', os.environ['INSTALL_URL'],
]
if os.environ['MINIMUM_VERSION_CODE']:
    args += ['--minimum-version-code', os.environ['MINIMUM_VERSION_CODE']]
command = ' '.join(shlex.quote(value) for value in [
    'docker', 'compose', '--env-file', '.deploy/current-image.env',
    '-f', 'infra/compose/docker-compose.prod.yml',
    'exec', '-T', 'clever-route-api', 'node',
    'dist/scripts/publish-dsv-driver-app-release.js', *args,
])
script = f"set -euo pipefail\ncd {shlex.quote(os.environ['APP_DIR'])}\n{command}\n"
with open(sys.argv[1], 'w', encoding='utf-8') as handle:
    json.dump({'commands': ['bash -lc ' + shlex.quote(script)]}, handle)
PY

COMMAND_ID="$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "Publish CLEVER Driver Android release ${VERSION_NAME} (${VERSION_CODE})" \
  --timeout-seconds 300 \
  --parameters "file://${PARAMETERS_PATH}" \
  --query Command.CommandId \
  --output text)"

set +e
aws ssm wait command-executed \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID"
WAIT_STATUS=$?
set -e
INVOCATION_JSON="$(aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,ResponseCode:ResponseCode,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
  --output json)"
[[ "$WAIT_STATUS" == '0' ]] || {
  printf '%s\n' "$INVOCATION_JSON" >&2
  fail "SSM command failed: $COMMAND_ID"
}

RELEASE_JSON="$(curl -fsS "${API_BASE_URL%/}/api/dsv/driver/app-release/android")"
node - "$RELEASE_JSON" "$VERSION_CODE" "$VERSION_NAME" "$APK_SHA256" "$INSTALL_URL" <<'NODE'
const envelope = JSON.parse(process.argv[2]);
const expected = {
  versionCode: Number(process.argv[3]),
  versionName: process.argv[4],
  sha256: process.argv[5],
  installUrl: process.argv[6],
};
const release = envelope.data;
if (
  release?.platform !== 'android'
  || release?.packageId !== 'com.evnsolution.clever.driver'
  || release?.latestVersionCode !== expected.versionCode
  || release?.latestVersionName !== expected.versionName
  || release?.apkSha256 !== expected.sha256
  || release?.installUrl !== expected.installUrl
) {
  throw new Error('Public DSV Driver release endpoint does not match the published APK');
}
NODE

printf 'DSV Driver release state published without server redeployment\n'
printf '  command: %s\n' "$COMMAND_ID"
printf '  version: %s (%s)\n' "$VERSION_NAME" "$VERSION_CODE"
