import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const publishScript = join(configDirectory, '../../scripts/publish-android-drive-release.sh');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Android Drive release command behavior', () => {
  it('performs no remote mutation unless --execute is explicit', () => {
    const root = mkdtempSync(join(tmpdir(), 'driver-release-test-'));
    temporaryDirectories.push(root);
    const repository = join(root, 'repository');
    const remote = join(root, 'origin.git');
    const mockBin = join(root, 'bin');
    const mutationMarker = join(root, 'remote-mutation');
    mkdirSync(repository);
    mkdirSync(mockBin);

    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
    execFileSync('git', ['init', '-b', 'dev'], { cwd: repository, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'release-test@example.test'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: repository });
    const apkPath = join(repository, 'app-release.apk');
    writeFileSync(apkPath, 'fixed test apk');
    execFileSync('git', ['add', 'app-release.apk'], { cwd: repository });
    execFileSync('git', ['commit', '-m', 'test release source'], {
      cwd: repository,
      stdio: 'ignore',
    });
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repository });
    execFileSync('git', ['push', '-u', 'origin', 'dev'], {
      cwd: repository,
      stdio: 'ignore',
    });

    writeExecutable(join(mockBin, 'apkanalyzer'), `#!/usr/bin/env bash
case "$2" in
  application-id) printf 'com.evnsolution.clever.driver' ;;
  version-code) printf '7' ;;
  version-name) printf '0.1.7' ;;
  *) exit 2 ;;
esac
`);
    writeExecutable(join(mockBin, 'gcloud'), `#!/usr/bin/env bash
case "$*" in
  'config get-value account') printf 'dlajiin@gmail.com' ;;
  'auth print-access-token') printf 'test-access-token' ;;
  *) exit 2 ;;
esac
`);
    writeExecutable(join(mockBin, 'curl'), `#!/usr/bin/env bash
sha="$(shasum -a 256 "$TEST_APK_PATH" | awk '{print $1}')"
drive_version="\${TEST_DRIVE_VERSION_CODE:-7}"
server_version="\${TEST_SERVER_VERSION_CODE:-7}"
drive_sha="$sha"
server_sha="$sha"
if [[ "$drive_version" != '7' ]]; then drive_sha="$(printf 'b%.0s' {1..64})"; fi
if [[ "$server_version" != '7' ]]; then server_sha="$(printf 'c%.0s' {1..64})"; fi
case "$*" in
  *'-X PATCH'*)
    printf 'PATCH\n' >> "$TEST_MUTATION_MARKER"
    printf 'location: https://www.googleapis.com/upload/drive/v3/files/1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y?upload_id=test\r\n'
    ;;
  *'-X PUT'*)
    printf 'PUT\n' >> "$TEST_MUTATION_MARKER"
    printf '{"id":"1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y","name":"clever-driver-latest.apk","sha256Checksum":"%s","appProperties":{"publishedVersionCode":"7","publishedVersionName":"0.1.7","apkSha256":"%s"}}' "$sha" "$sha"
    ;;
  *'www.googleapis.com/drive/v3/files/'*)
    printf '{"id":"1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y","name":"clever-driver-latest.apk","parents":["1VybPlbJcNiCb-FvC1zQf4QjAYe_2aSZR"],"capabilities":{"canModifyContent":true},"appProperties":{"publishedVersionCode":"%s","publishedVersionName":"0.1.%s","apkSha256":"%s"}}' "$drive_version" "$drive_version" "$drive_sha"
    ;;
  *'/api/dsv/driver/app-release/android'*)
    printf '{"data":{"platform":"android","packageId":"com.evnsolution.clever.driver","latestVersionCode":%s,"latestVersionName":"0.1.%s","minimumSupportedVersionCode":%s,"apkSha256":"%s","installUrl":"https://drive.usercontent.google.com/download?id=1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y&export=download&confirm=t"}}' "$server_version" "$server_version" "$server_version" "$server_sha"
    ;;
  *'drive.usercontent.google.com/download'*)
    previous=''
    for argument in "$@"; do
      if [[ "$previous" == '--output' ]]; then
        cp "$TEST_APK_PATH" "$argument"
        exit 0
      fi
      previous="$argument"
    done
    exit 4
    ;;
  *) exit 3 ;;
esac
`);

    const baseEnvironment = {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TEST_APK_PATH: apkPath,
      TEST_MUTATION_MARKER: mutationMarker,
    };
    const result = spawnSync('bash', [publishScript, '--apk', apkPath], {
      cwd: repository,
      encoding: 'utf8',
      env: baseEnvironment,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /preflight passed/u);
    assert.match(result.stdout, /Dry run only/u);
    assert.equal(existsSync(mutationMarker), false);

    const driveRecoveryResult = spawnSync(
      'bash',
      [publishScript, '--apk', apkPath, '--execute'],
      {
        cwd: repository,
        encoding: 'utf8',
        env: { ...baseEnvironment, TEST_DRIVE_VERSION_CODE: '6' },
      },
    );
    assert.equal(driveRecoveryResult.status, 0, driveRecoveryResult.stderr);
    assert.equal(
      readFileSync(mutationMarker, 'utf8'),
      'PATCH\nPUT\n',
    );

    const nonProductionResult = spawnSync(
      'bash',
      [publishScript, '--apk', apkPath],
      {
        cwd: repository,
        encoding: 'utf8',
        env: { ...baseEnvironment, DSV_API_BASE_URL: 'https://staging.example.test' },
      },
    );
    assert.notEqual(nonProductionResult.status, 0);
    assert.match(nonProductionResult.stderr, /release API must be/u);

    const loweredMinimumResult = spawnSync(
      'bash',
      [publishScript, '--apk', apkPath],
      {
        cwd: repository,
        encoding: 'utf8',
        env: { ...baseEnvironment, MINIMUM_SUPPORTED_VERSION_CODE: '6' },
      },
    );
    assert.notEqual(loweredMinimumResult.status, 0);
    assert.match(loweredMinimumResult.stderr, /cannot be lower than production minimum 7/u);
  });
});

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}
