const appConfig = require('./app.json').expo;
const { withAndroidManifest } = require('expo/config-plugins');
const isolatedAndroid = process.env.CLEVER_DRIVER_ISOLATED_ANDROID === 'true';

const withAndroidCleartextPolicy = (config) =>
  withAndroidManifest(config, (pluginConfig) => {
    const application = pluginConfig.modResults.manifest.application[0].$;
    if (isolatedAndroid) application['android:usesCleartextTraffic'] = 'true';
    else delete application['android:usesCleartextTraffic'];
    return pluginConfig;
  });

module.exports = {
  ...appConfig,
  name: isolatedAndroid ? 'CLEVER Driver Integration' : appConfig.name,
  plugins: [...appConfig.plugins, withAndroidCleartextPolicy],
  android: {
    ...appConfig.android,
    package: isolatedAndroid
      ? 'com.evnsolution.clever.driver.integration'
      : appConfig.android.package,
    googleServicesFile: isolatedAndroid
      ? undefined
      : process.env.GOOGLE_SERVICES_JSON ??
        appConfig.android.googleServicesFile,
  },
};
