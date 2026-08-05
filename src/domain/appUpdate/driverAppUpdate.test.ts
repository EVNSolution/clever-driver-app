import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyDriverAppUpdate, readDriverAppRelease } from './driverAppUpdate';

const release = {
  apkSha256: 'a'.repeat(64),
  installUrl: 'https://drive.usercontent.google.com/download?id=fixed&export=download',
  latestVersionCode: 3,
  latestVersionName: '0.1.2',
  minimumSupportedVersionCode: 2,
  packageId: 'com.evnsolution.clever.driver',
  platform: 'android' as const,
  publishedAt: '2026-08-05T01:00:00.000Z',
};

describe('driver app update classification', () => {
  it('requires an update below the minimum supported version', () => {
    assert.equal(classifyDriverAppUpdate({
      currentPackageId: release.packageId,
      currentVersionCode: 1,
      release,
    }).kind, 'required_update');
  });

  it('offers a dismissible update between minimum and latest', () => {
    assert.equal(classifyDriverAppUpdate({
      currentPackageId: release.packageId,
      currentVersionCode: 2,
      release,
    }).kind, 'optional_update');
  });

  it('accepts the current or newer installed build', () => {
    assert.equal(classifyDriverAppUpdate({
      currentPackageId: release.packageId,
      currentVersionCode: 3,
      release,
    }).kind, 'up_to_date');
  });

  it('rejects malformed server release data', () => {
    assert.throws(() => readDriverAppRelease({ ...release, installUrl: 'http://unsafe.test/app.apk' }));
  });
});
