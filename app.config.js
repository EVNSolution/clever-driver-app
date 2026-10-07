const appConfig = require('./app.json').expo;
const isolatedAndroid = process.env.CLEVER_DRIVER_ISOLATED_ANDROID === 'true';

module.exports = {
  ...appConfig,
  name: isolatedAndroid ? 'CLEVER Driver Integration' : appConfig.name,
  android: {
    ...appConfig.android,
    package: isolatedAndroid
      ? 'com.evnsolution.clever.driver.integration'
      : appConfig.android.package,
    usesCleartextTraffic: isolatedAndroid || undefined,
    googleServicesFile: isolatedAndroid
      ? undefined
      : process.env.GOOGLE_SERVICES_JSON ??
        appConfig.android.googleServicesFile,
  },
};
