import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(configDirectory, '../..');
const agents = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const policy = readFileSync(join(projectRoot, 'docs/android-drive-release.md'), 'utf8');
const buildRunbook = readFileSync(join(projectRoot, 'docs/android-build-runbook.md'), 'utf8');
const publishScript = readFileSync(join(projectRoot, 'scripts/publish-android-drive-release.sh'), 'utf8');

describe('Android Google Drive release policy', () => {
  it('publishes through one reviewed command', () => {
    assert.equal(
      packageJson.scripts?.['release:android:drive'],
      'bash scripts/publish-android-drive-release.sh',
    );
    assert.equal(
      packageJson.scripts?.['build:android:release:apk'],
      'NODE_ENV=production npx expo prebuild --platform android --no-install && cd android && ./gradlew assembleRelease --build-cache -PreactNativeArchitectures=armeabi-v7a,arm64-v8a',
    );
  });

  it('documents the persistent cached build path and slow-build response', () => {
    assert.match(buildRunbook, /영구 릴리스 작업공간/u);
    assert.match(buildRunbook, /npm run build:android:release:apk -- --profile/u);
    assert.match(buildRunbook, /Configuration Cache/u);
    assert.match(buildRunbook, /20분/u);
  });

  it('keeps one stable Drive file identity and replaces content only', () => {
    assert.match(publishScript, /DRIVE_FILE_ID='1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y'/u);
    assert.match(publishScript, /DRIVE_FILE_NAME='clever-driver-latest\.apk'/u);
    assert.match(publishScript, /DRIVE_FOLDER_ID='1VybPlbJcNiCb-FvC1zQf4QjAYe_2aSZR'/u);
    assert.match(publishScript, /-X PATCH/u);
    assert.doesNotMatch(publishScript, /-X POST/u);
  });

  it('requires the approved package and owner while allowing only an identical release retry', () => {
    assert.match(publishScript, /EXPECTED_ACCOUNT='dlajiin@gmail\.com'/u);
    assert.match(publishScript, /EXPECTED_PACKAGE_ID='com\.evnsolution\.clever\.driver'/u);
    assert.match(
      publishScript,
      /EXPECTED_SIGNER_SHA256='fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'/u,
    );
    assert.match(publishScript, /unexpected APK signer certificate/u);
    assert.match(publishScript, /EXPECTED_ABIS='arm64-v8a,armeabi-v7a'/u);
    assert.match(publishScript, /APK ABIs must be/u);
    assert.match(publishScript, /versionCode cannot be lower than published versionCode/u);
    assert.match(publishScript, /published versionCode already has different APK contents/u);
    assert.match(publishScript, /publish-dsv-driver-release-state\.sh/u);
  });

  it('defaults to a non-mutating preflight and requires an explicit execute flag', () => {
    assert.match(publishScript, /EXECUTE='false'/u);
    assert.match(publishScript, /--execute/u);
    assert.match(publishScript, /Dry run only\. Re-run with --execute to publish\./u);
  });

  it('accepts releases only from a clean synchronized integration branch', () => {
    assert.match(publishScript, /release source branch must be dev or main/u);
    assert.match(publishScript, /release source worktree must be clean/u);
    assert.match(publishScript, /release source HEAD must match origin/u);
  });

  it('checks production state before publishing and verifies the full public APK checksum', () => {
    assert.match(publishScript, /production release state lookup failed/u);
    assert.match(publishScript, /api\/dsv\/driver\/app-release\/android/u);
    assert.match(publishScript, /curl -fsSL "\$INSTALL_URL" --output "\$DOWNLOADED_APK"/u);
    assert.match(publishScript, /anonymous download checksum does not match the published APK/u);
    assert.match(publishScript, /release API must be \$EXPECTED_API_BASE_URL/u);
    assert.match(publishScript, /minimum versionCode cannot be lower than production minimum/u);
  });

  it('documents the immutable install link and agent rule', () => {
    assert.match(
      policy,
      /https:\/\/drive\.usercontent\.google\.com\/download\?id=1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y&export=download&confirm=t/u,
    );
    assert.match(agents, /기존 Drive 파일 ID의 APK 내용만 교체/u);
    assert.match(agents, /docs\/android-build-runbook\.md/u);
    assert.match(agents, /영구 릴리스 작업공간/u);
  });
});
