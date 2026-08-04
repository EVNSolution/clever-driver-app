#!/usr/bin/env bash

set -euo pipefail

EXPECTED_ACCOUNT='dlajiin@gmail.com'
EXPECTED_PACKAGE_ID='com.evnsolution.clever.driver'
DRIVE_FOLDER_ID='1VybPlbJcNiCb-FvC1zQf4QjAYe_2aSZR'
DRIVE_FILE_ID='1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y'
DRIVE_FILE_NAME='clever-driver-latest.apk'
INSTALL_URL="https://drive.usercontent.google.com/download?id=${DRIVE_FILE_ID}&export=download&confirm=t"
APK_PATH="${1:-android/app/build/outputs/apk/release/app-release.apk}"

fail() {
  printf 'Android Drive release failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_command curl
require_command gcloud
require_command node
require_command shasum
require_command stat

if command -v apkanalyzer >/dev/null 2>&1; then
  APK_ANALYZER="$(command -v apkanalyzer)"
elif [[ -n "${ANDROID_SDK_ROOT:-}" && -x "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/apkanalyzer" ]]; then
  APK_ANALYZER="${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/apkanalyzer"
elif [[ -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/cmdline-tools/latest/bin/apkanalyzer" ]]; then
  APK_ANALYZER="${ANDROID_HOME}/cmdline-tools/latest/bin/apkanalyzer"
else
  fail 'apkanalyzer is required; add Android SDK cmdline-tools to PATH'
fi

[[ -f "$APK_PATH" ]] || fail "APK not found: $APK_PATH"

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[[ "$ACTIVE_ACCOUNT" == "$EXPECTED_ACCOUNT" ]] \
  || fail "active gcloud account must be $EXPECTED_ACCOUNT"

PACKAGE_ID="$($APK_ANALYZER manifest application-id "$APK_PATH")"
VERSION_CODE="$($APK_ANALYZER manifest version-code "$APK_PATH")"
VERSION_NAME="$($APK_ANALYZER manifest version-name "$APK_PATH")"
[[ "$PACKAGE_ID" == "$EXPECTED_PACKAGE_ID" ]] || fail "unexpected Android package: $PACKAGE_ID"
[[ "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail "invalid APK versionCode: $VERSION_CODE"
[[ -n "$VERSION_NAME" ]] || fail 'APK versionName is empty'

ACCESS_TOKEN="$(gcloud auth print-access-token)"
REMOTE_JSON="$(curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?fields=id,name,parents,appProperties,capabilities(canModifyContent)&supportsAllDrives=true")"

REMOTE_ID="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.id ?? "")' "$REMOTE_JSON")"
REMOTE_NAME="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.name ?? "")' "$REMOTE_JSON")"
REMOTE_PARENT="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.parents?.[0] ?? "")' "$REMOTE_JSON")"
CAN_MODIFY="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value.capabilities?.canModifyContent === true))' "$REMOTE_JSON")"
PUBLISHED_VERSION_CODE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.publishedVersionCode ?? "")' "$REMOTE_JSON")"

[[ "$REMOTE_ID" == "$DRIVE_FILE_ID" ]] || fail 'fixed Drive file was not found'
[[ "$REMOTE_NAME" == "$DRIVE_FILE_NAME" ]] || fail "Drive file name must remain $DRIVE_FILE_NAME"
[[ "$REMOTE_PARENT" == "$DRIVE_FOLDER_ID" ]] || fail 'Drive file is outside the approved release folder'
[[ "$CAN_MODIFY" == 'true' ]] || fail 'active account cannot modify the Drive release file'
[[ "$PUBLISHED_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || fail 'published version metadata is missing or invalid'
(( VERSION_CODE > PUBLISHED_VERSION_CODE )) \
  || fail "new versionCode must be greater than published versionCode ${PUBLISHED_VERSION_CODE}"

APK_SIZE="$(stat -f%z "$APK_PATH")"
APK_SHA256="$(shasum -a 256 "$APK_PATH" | awk '{print $1}')"
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
  | awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}')"

[[ "$UPLOAD_URL" == https://www.googleapis.com/upload/drive/v3/files/${DRIVE_FILE_ID}\?* ]] \
  || fail 'unexpected Drive resumable upload URL'
[[ "$UPLOAD_URL" == *upload_id=* ]] || fail 'Drive resumable upload ID is missing'

RESULT_JSON="$(curl -fsS -X PUT "$UPLOAD_URL" \
  -H 'Content-Type: application/vnd.android.package-archive' \
  -H "Content-Length: ${APK_SIZE}" \
  --upload-file "$APK_PATH")"

RESULT_ID="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.id ?? "")' "$RESULT_JSON")"
RESULT_NAME="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.name ?? "")' "$RESULT_JSON")"
RESULT_SHA256="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.sha256Checksum ?? "")' "$RESULT_JSON")"
RESULT_VERSION_CODE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.appProperties?.publishedVersionCode ?? "")' "$RESULT_JSON")"

[[ "$RESULT_ID" == "$DRIVE_FILE_ID" ]] || fail 'Drive file ID changed unexpectedly'
[[ "$RESULT_NAME" == "$DRIVE_FILE_NAME" ]] || fail 'Drive file name changed unexpectedly'
[[ "$RESULT_SHA256" == "$APK_SHA256" ]] || fail 'uploaded APK checksum does not match the local APK'
[[ "$RESULT_VERSION_CODE" == "$VERSION_CODE" ]] || fail 'published version metadata does not match the APK'

DOWNLOAD_STATUS="$(curl -sS -L --range 0-0 -o /dev/null -w '%{http_code}' "$INSTALL_URL")"
[[ "$DOWNLOAD_STATUS" == '206' || "$DOWNLOAD_STATUS" == '200' ]] \
  || fail "anonymous install URL returned HTTP $DOWNLOAD_STATUS"

printf 'CLEVER Driver Android release published\n'
printf '  file: %s (%s)\n' "$DRIVE_FILE_NAME" "$DRIVE_FILE_ID"
printf '  version: %s (%s)\n' "$VERSION_NAME" "$VERSION_CODE"
printf '  sha256: %s\n' "$APK_SHA256"
printf '  install: %s\n' "$INSTALL_URL"
