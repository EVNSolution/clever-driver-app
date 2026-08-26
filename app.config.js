const appConfig = require('./app.json').expo;

module.exports = {
  ...appConfig,
  android: {
    ...appConfig.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ??
      appConfig.android.googleServicesFile,
  },
};
