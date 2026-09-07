#!/usr/bin/env bash

set -euo pipefail

EXPECTED_ACCOUNT='dlajiin@gmail.com'
EXPECTED_API_BASE_URL='https://clever-route-api.cleversystem.ai'
EXPECTED_PACKAGE_ID='com.evnsolution.clever.driver'
EXPECTED_SIGNER_SHA256='fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
EXPECTED_ABIS='arm64-v8a,armeabi-v7a'
DRIVE_FOLDER_ID='1VybPlbJcNiCb-FvC1zQf4QjAYe_2aSZR'
DRIVE_FILE_ID='1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y'
DRIVE_FILE_NAME='clever-driver-latest.apk'
INSTALL_URL="https://drive.usercontent.google.com/download?id=${DRIVE_FILE_ID}&export=download&confirm=t"
API_BASE_URL="${DSV_API_BASE_URL:-$EXPECTED_API_BASE_URL}"
APK_PATH='android/app/build/outputs/apk/release/app-release.apk'
EXECUTE='false'

fail() {
  printf 'Android Drive release failed: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: publish-android-drive-release.sh [--apk PATH] [--execute]

Without --execute, validates the source, APK, Drive target, and production
release state, then prints the planned mutations without publishing.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

while (( $# > 0 )); do
  case "$1" in
    --apk)
      (( $# >= 2 )) || fail '--apk requires a path'
      APK_PATH="$2"
      shift 2
      ;;
    --execute)
      EXECUTE='true'
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ "${API_BASE_URL%/}" == "$EXPECTED_API_BASE_URL" ]] \
  || fail "release API must be $EXPECTED_API_BASE_URL"

for command in curl gcloud git node shasum; do
  require_command "$command"
done

if command -v apkanalyzer >/dev/null 2>&1; then
  APK_ANALYZER="$(command -v apkanalyzer)"
elif [[ -n "${ANDROID_SDK_ROOT:-}" && -x "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/apkanalyzer" ]]; then
  APK_ANALYZER="${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/apkanalyzer"
elif [[ -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/cmdline-tools/latest/bin/apkanalyzer" ]]; then
  APK_ANALYZER="${ANDROID_HOME}/cmdline-tools/latest/bin/apkanalyzer"
else
  fail 'apkanalyzer is required; add Android SDK cmdline-tools to PATH'
fi

if command -v apksigner >/dev/null 2>&1; then
  APK_SIGNER="$(command -v apksigner)"
elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  APK_SIGNER="$(find "${ANDROID_SDK_ROOT}/build-tools" -type f -name apksigner -perm -111 2>/dev/null | sort | tail -1)"
elif [[ -n "${ANDROID_HOME:-}" ]]; then
  APK_SIGNER="$(find "${ANDROID_HOME}/build-tools" -type f -name apksigner -perm -111 2>/dev/null | sort | tail -1)"
else
  APK_SIGNER=''
fi
[[ -n "$APK_SIGNER" ]] || fail 'apksigner is required; install Android SDK build-tools'

[[ -f "$APK_PATH" ]] || fail "APK not found: $APK_PATH"

SOURCE_BRANCH="$(git branch --show-current)"
[[ "$SOURCE_BRANCH" == 'dev' || "$SOURCE_BRANCH" == 'main' ]] \
  || fail 'release source branch must be dev or main'
[[ -z "$(git status --porcelain --untracked-files=all)" ]] \
  || fail 'release source worktree must be clean'
SOURCE_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git ls-remote --exit-code origin "refs/heads/${SOURCE_BRANCH}" | awk '{print $1}')"
[[ -n "$REMOTE_HEAD" ]] || fail "origin/${SOURCE_BRANCH} was not found"
[[ "$SOURCE_HEAD" == "$REMOTE_HEAD" ]] \
  || fail "release source HEAD must match origin/${SOURCE_BRANCH}"

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[[ "$ACTIVE_ACCOUNT" == "$EXPECTED_ACCOUNT" ]] \
  || fail "active gcloud account must be $EXPECTED_ACCOUNT"

PACKAGE_ID="$($APK_ANALYZER manifest application-id "$APK_PATH")"
VERSION_CODE="$($APK_ANALYZER manifest version-code "$APK_PATH")"
VERSION_NAME="$($APK_ANALYZER manifest version-name "$APK_PATH")"
APK_ABIS="$($APK_ANALYZER files list "$APK_PATH" \
  | awk -F/ '{ for (field = 1; field <= NF; field += 1) if ($field == "lib" && field < NF && $(field + 1) != "") print $(field + 1) }' \
  | sort -u \
  | paste -sd, -)"
SIGNER_SHA256="$($APK_SIGNER verify --print-certs "$APK_PATH" \
  | awk -F': ' '/Signer #1 certificate SHA-256 digest:/ {print tolower($2); exit}')"
[[ "$PACKAGE_ID" == "$EXPECTED_PACKAGE_ID" ]] || fail "unexpected Android package: $PACKAGE_ID"
[[ "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail "invalid APK versionCode: $VERSION_CODE"
[[ -n "$VERSION_NAME" ]] || fail 'APK versionName is empty'
[[ "$APK_ABIS" == "$EXPECTED_ABIS" ]] \
  || fail "APK ABIs must be ${EXPECTED_ABIS}; found ${APK_ABIS:-none}"
[[ "$SIGNER_SHA256" == "$EXPECTED_SIGNER_SHA256" ]] \
  || fail "unexpected APK signer certificate: ${SIGNER_SHA256:-missing}"
if [[ -n "${MINIMUM_SUPPORTED_VERSION_CODE:-}" ]]; then
  [[ "$MINIMUM_SUPPORTED_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] \
    || fail 'minimum versionCode must be a positive integer'
  (( MINIMUM_SUPPORTED_VERSION_CODE <= VERSION_CODE )) \
    || fail 'minimum versionCode exceeds APK versionCode'
fi

APK_SIZE="$(node -e 'process.stdout.write(String(require("node:fs").statSync(process.argv[1]).size))' "$APK_PATH")"
APK_SHA256="$(shasum -a 256 "$APK_PATH" | awk '{print $1}')"

ACCESS_TOKEN="$(gcloud auth print-access-token)"
REMOTE_JSON="$(curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?fields=id,name,parents,appProperties,capabilities(canModifyContent)&supportsAllDrives=true")"

REMOTE_ID="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.id ?? "")' "$REMOTE_JSON")"
REMOTE_NAME="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.name ?? "")' "$REMOTE_JSON")"
REMOTE_PARENT="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.parents?.[0] ?? "")' "$REMOTE_JSON")"
CAN_MODIFY="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value.capabilities?.canModifyContent === true))' "$REMOTE_JSON")"
PUBLISHED_VERSION_CODE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.publishedVersionCode ?? "")' "$REMOTE_JSON")"
PUBLISHED_VERSION_NAME="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.publishedVersionName ?? "")' "$REMOTE_JSON")"
PUBLISHED_SHA256="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.apkSha256 ?? "")' "$REMOTE_JSON")"

[[ "$REMOTE_ID" == "$DRIVE_FILE_ID" ]] || fail 'fixed Drive file was not found'
[[ "$REMOTE_NAME" == "$DRIVE_FILE_NAME" ]] || fail "Drive file name must remain $DRIVE_FILE_NAME"
[[ "$REMOTE_PARENT" == "$DRIVE_FOLDER_ID" ]] || fail 'Drive file is outside the approved release folder'
[[ "$CAN_MODIFY" == 'true' ]] || fail 'active account cannot modify the Drive release file'
[[ "$PUBLISHED_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'published version metadata is missing or invalid'

if (( VERSION_CODE < PUBLISHED_VERSION_CODE )); then
  fail "versionCode cannot be lower than published versionCode ${PUBLISHED_VERSION_CODE}"
fi
if (( VERSION_CODE == PUBLISHED_VERSION_CODE )); then
  [[ "$VERSION_NAME" == "$PUBLISHED_VERSION_NAME" ]] \
    || fail 'published versionCode already has a different versionName'
  [[ "$APK_SHA256" == "$PUBLISHED_SHA256" ]] \
    || fail 'published versionCode already has different APK contents'
fi

PRODUCTION_RELEASE_JSON="$(curl -fsS \
  -H 'Accept: application/json' \
  -H 'Cache-Control: no-cache' \
  -H 'Pragma: no-cache' \
  "${API_BASE_URL%/}/api/dsv/driver/app-release/android")" \
  || fail 'production release state lookup failed'
read -r SERVER_PACKAGE_ID SERVER_VERSION_CODE SERVER_VERSION_NAME SERVER_MINIMUM_VERSION_CODE SERVER_SHA256 SERVER_INSTALL_URL <<EOF_SERVER
$(node - "$PRODUCTION_RELEASE_JSON" <<'NODE'
const envelope = JSON.parse(process.argv[2]);
const release = envelope.data;
if (!release || release.platform !== 'android') {
  throw new Error('production Android release data is missing');
}
process.stdout.write([
  release.packageId ?? '',
  release.latestVersionCode ?? '',
  release.latestVersionName ?? '',
  release.minimumSupportedVersionCode ?? '',
  release.apkSha256 ?? '',
  release.installUrl ?? '',
].join(' '));
NODE
)
EOF_SERVER

[[ "$SERVER_PACKAGE_ID" == "$EXPECTED_PACKAGE_ID" ]] || fail 'production release package is unexpected'
[[ "$SERVER_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'production release versionCode is invalid'
[[ "$SERVER_MINIMUM_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'production minimum versionCode is invalid'
(( SERVER_MINIMUM_VERSION_CODE <= SERVER_VERSION_CODE )) || fail 'production minimum versionCode exceeds latest versionCode'
[[ "$SERVER_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail 'production release checksum is invalid'
[[ "$SERVER_INSTALL_URL" == "$INSTALL_URL" ]] || fail 'production release install URL is not the fixed Drive URL'
if (( VERSION_CODE < SERVER_VERSION_CODE )); then
  fail "versionCode cannot be lower than production versionCode ${SERVER_VERSION_CODE}"
fi
if [[ -n "${MINIMUM_SUPPORTED_VERSION_CODE:-}" ]] \
  && (( MINIMUM_SUPPORTED_VERSION_CODE < SERVER_MINIMUM_VERSION_CODE )); then
  fail "minimum versionCode cannot be lower than production minimum ${SERVER_MINIMUM_VERSION_CODE}"
fi
if (( VERSION_CODE == SERVER_VERSION_CODE )); then
  [[ "$VERSION_NAME" == "$SERVER_VERSION_NAME" ]] \
    || fail 'production versionCode already has a different versionName'
  [[ "$APK_SHA256" == "$SERVER_SHA256" ]] \
    || fail 'production versionCode already has different APK contents'
fi

NEEDS_DRIVE_UPLOAD='false'
NEEDS_SERVER_PUBLISH='false'
if (( VERSION_CODE > PUBLISHED_VERSION_CODE )); then
  NEEDS_DRIVE_UPLOAD='true'
fi
if (( VERSION_CODE > SERVER_VERSION_CODE )) || [[ -n "${MINIMUM_SUPPORTED_VERSION_CODE:-}" ]]; then
  NEEDS_SERVER_PUBLISH='true'
fi

printf 'CLEVER Driver Android release preflight passed\n'
printf '  source: %s @ %s\n' "$SOURCE_BRANCH" "$SOURCE_HEAD"
printf '  artifact: %s (%s), sha256 %s\n' "$VERSION_NAME" "$VERSION_CODE" "$APK_SHA256"
printf '  Drive upload: %s\n' "$NEEDS_DRIVE_UPLOAD"
printf '  server metadata publish: %s\n' "$NEEDS_SERVER_PUBLISH"
if [[ "$EXECUTE" != 'true' ]]; then
  printf 'Dry run only. Re-run with --execute to publish.\n'
  exit 0
fi

RESULT_JSON="$REMOTE_JSON"
if [[ "$NEEDS_DRIVE_UPLOAD" == 'true' ]]; then
  METADATA_JSON="$(node -e '
    process.stdout.write(JSON.stringify({ appProperties: {
      apkSha256: process.argv[3],
      publishedVersionCode: process.argv[1],
      publishedVersionName: process.argv[2],
    }}));
  ' "$VERSION_CODE" "$VERSION_NAME" "$APK_SHA256")"

  UPLOAD_URL="$(curl -fsS -D - -o /dev/null -X PATCH \
    "https://www.googleapis.com/upload/drive/v3/files/${DRIVE_FILE_ID}?uploadType=resumable&fields=id,name,size,sha256Checksum,appProperties" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H 'Content-Type: application/json; charset=UTF-8' \
    -H 'X-Upload-Content-Type: application/vnd.android.package-archive' \
    -H "X-Upload-Content-Length: ${APK_SIZE}" \
    --data "$METADATA_JSON" \
    | awk 'tolower($0) ~ /^location:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}')"

  [[ "$UPLOAD_URL" == https://www.googleapis.com/upload/drive/v3/files/${DRIVE_FILE_ID}\?* ]] \
    || fail 'unexpected Drive resumable upload URL'
  [[ "$UPLOAD_URL" == *upload_id=* ]] || fail 'Drive resumable upload ID is missing'

  RESULT_JSON="$(curl -fsS -X PUT "$UPLOAD_URL" \
    -H 'Content-Type: application/vnd.android.package-archive' \
    -H "Content-Length: ${APK_SIZE}" \
    --upload-file "$APK_PATH")"
fi

RESULT_ID="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.id ?? "")' "$RESULT_JSON")"
RESULT_NAME="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.name ?? "")' "$RESULT_JSON")"
RESULT_SHA256="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.sha256Checksum ?? value.appProperties?.apkSha256 ?? "")' "$RESULT_JSON")"
RESULT_VERSION_CODE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.publishedVersionCode ?? "")' "$RESULT_JSON")"

[[ "$RESULT_ID" == "$DRIVE_FILE_ID" ]] || fail 'Drive file ID changed unexpectedly'
[[ "$RESULT_NAME" == "$DRIVE_FILE_NAME" ]] || fail 'Drive file name changed unexpectedly'
[[ "$RESULT_SHA256" == "$APK_SHA256" ]] || fail 'uploaded APK checksum does not match the local APK'
[[ "$RESULT_VERSION_CODE" == "$VERSION_CODE" ]] || fail 'published version metadata does not match the APK'

DOWNLOADED_APK="$(mktemp "${TMPDIR:-/tmp}/clever-driver-download.XXXXXX")"
trap 'rm -f "$DOWNLOADED_APK"' EXIT
curl -fsSL "$INSTALL_URL" --output "$DOWNLOADED_APK"
DOWNLOADED_SHA256="$(shasum -a 256 "$DOWNLOADED_APK" | awk '{print $1}')"
[[ "$DOWNLOADED_SHA256" == "$APK_SHA256" ]] \
  || fail 'anonymous download checksum does not match the published APK'

if [[ "$NEEDS_SERVER_PUBLISH" == 'true' ]]; then
  DSV_API_BASE_URL="$EXPECTED_API_BASE_URL" \
    bash "$(dirname "$0")/publish-dsv-driver-release-state.sh" \
    "$VERSION_CODE" "$VERSION_NAME" "$APK_SHA256" "$INSTALL_URL"
fi

printf 'CLEVER Driver Android release published\n'
printf '  file: %s (%s)\n' "$DRIVE_FILE_NAME" "$DRIVE_FILE_ID"
printf '  version: %s (%s)\n' "$VERSION_NAME" "$VERSION_CODE"
printf '  sha256: %s\n' "$APK_SHA256"
printf '  install: %s\n' "$INSTALL_URL"
