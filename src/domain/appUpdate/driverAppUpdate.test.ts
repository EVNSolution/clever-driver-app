import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyDriverAppUpdate,
  readDriverAppRelease,
  resolveDeliveryActivityForUpdate,
  retainDriverAppUpdateAfterLookupFailure,
  shouldPresentDriverAppUpdate,
  shouldRecheckDriverAppUpdate,
} from './driverAppUpdate';

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

  it('does not interrupt an active delivery with an update screen', () => {
    assert.equal(shouldPresentDriverAppUpdate({
      dismissedOptionalVersionCode: null,
      isDeliveryActive: true,
      state: { kind: 'required_update', release },
    }), false);
  });

  it('presents a required update when delivery is inactive', () => {
    assert.equal(shouldPresentDriverAppUpdate({
      dismissedOptionalVersionCode: null,
      isDeliveryActive: false,
      state: { kind: 'required_update', release },
    }), true);
  });

  it('only dismisses the optional release that the driver already saw', () => {
    assert.equal(shouldPresentDriverAppUpdate({
      dismissedOptionalVersionCode: release.latestVersionCode,
      isDeliveryActive: false,
      state: { kind: 'optional_update', release },
    }), false);
    assert.equal(shouldPresentDriverAppUpdate({
      dismissedOptionalVersionCode: release.latestVersionCode,
      isDeliveryActive: false,
      state: {
        kind: 'optional_update',
        release: { ...release, latestVersionCode: release.latestVersionCode + 1 },
      },
    }), true);
  });

  it('rechecks after the configured interval or when forced', () => {
    assert.equal(shouldRecheckDriverAppUpdate({
      intervalMs: 60_000,
      lastCheckedAt: 100_000,
      now: 159_999,
    }), false);
    assert.equal(shouldRecheckDriverAppUpdate({
      intervalMs: 60_000,
      lastCheckedAt: 100_000,
      now: 160_000,
    }), true);
    assert.equal(shouldRecheckDriverAppUpdate({
      force: true,
      intervalMs: 60_000,
      lastCheckedAt: 159_999,
      now: 160_000,
    }), true);
  });

  it('preserves a known update requirement when a later lookup fails', () => {
    const requiredState = { kind: 'required_update', release } as const;

    assert.equal(
      retainDriverAppUpdateAfterLookupFailure(requiredState),
      requiredState,
    );
    assert.deepEqual(
      retainDriverAppUpdateAfterLookupFailure({ kind: 'checking' }),
      { kind: 'unavailable' },
    );
  });

  it('treats a route error as unknown and pickup completion as active delivery', () => {
    assert.equal(resolveDeliveryActivityForUpdate({
      loadState: 'error',
      nextDeliveryStopId: 'stop-1',
      pickupCompletedAt: '2026-08-06T00:00:00.000Z',
    }), null);
    assert.equal(resolveDeliveryActivityForUpdate({
      loadState: 'ready',
      nextDeliveryStopId: 'stop-1',
      pickupCompletedAt: '2026-08-06T00:00:00.000Z',
    }), true);
    assert.equal(resolveDeliveryActivityForUpdate({
      loadState: 'ready',
      nextDeliveryStopId: 'stop-1',
      pickupCompletedAt: null,
    }), false);
  });
});
