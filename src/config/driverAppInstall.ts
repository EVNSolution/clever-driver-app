export const DRIVER_ANDROID_PACKAGE_ID = 'com.evnsolution.clever.driver';
export const DRIVER_APP_INSTALL_PAGE_URL = 'https://dsv.cleversystem.ai/driver-app';

export function isProductionDriverAndroidPackage(packageId: string): boolean {
  return packageId === DRIVER_ANDROID_PACKAGE_ID;
}
