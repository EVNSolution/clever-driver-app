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
const publishScript = readFileSync(join(projectRoot, 'scripts/publish-android-drive-release.sh'), 'utf8');

describe('Android Google Drive release policy', () => {
  it('publishes through one reviewed command', () => {
    assert.equal(
      packageJson.scripts?.['release:android:drive'],
      'bash scripts/publish-android-drive-release.sh',
    );
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
    assert.match(publishScript, /versionCode cannot be lower than published versionCode/u);
    assert.match(publishScript, /published versionCode already has different APK contents/u);
    assert.match(publishScript, /publish-dsv-driver-release-state\.sh/u);
  });

  it('documents the immutable install link and agent rule', () => {
    assert.match(
      policy,
      /https:\/\/drive\.usercontent\.google\.com\/download\?id=1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y&export=download&confirm=t/u,
    );
    assert.match(agents, /기존 Drive 파일 ID의 APK 내용만 교체/u);
  });
});
