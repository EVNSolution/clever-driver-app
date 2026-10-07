const appConfig = require('./app.json').expo;
const { withAndroidManifest } = require('expo/config-plugins');
const isolatedAndroid = process.env.CLEVER_DRIVER_ISOLATED_ANDROID === 'true';

const withIsolatedAndroidCleartext = (config) =>
  withAndroidManifest(config, (pluginConfig) => {
    pluginConfig.modResults.manifest.application[0].$[
      'android:usesCleartextTraffic'
    ] = 'true';
    return pluginConfig;
  });

module.exports = {
  ...appConfig,
  name: isolatedAndroid ? 'CLEVER Driver Integration' : appConfig.name,
  plugins: isolatedAndroid
    ? [...appConfig.plugins, withIsolatedAndroidCleartext]
    : appConfig.plugins,
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
