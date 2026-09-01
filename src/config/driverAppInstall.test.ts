import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DRIVER_ANDROID_PACKAGE_ID,
  isProductionDriverAndroidPackage,
} from './driverAppInstall';

describe('driver Android package identity', () => {
  it('runs production update checks only for the production package', () => {
    assert.equal(
      isProductionDriverAndroidPackage(DRIVER_ANDROID_PACKAGE_ID),
      true,
    );
    assert.equal(
      isProductionDriverAndroidPackage(`${DRIVER_ANDROID_PACKAGE_ID}.manualqa`),
      false,
    );
  });
});
