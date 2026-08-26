import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type ExpoConfig = {
  expo: {
    icon: string;
    name: string;
    owner: string;
    slug: string;
    scheme: string;
    version: string;
    ios: {
      bundleIdentifier: string;
    };
    android: {
      blockedPermissions: string[];
      adaptiveIcon: {
        backgroundColor: string;
        foregroundImage: string;
      };
      package: string;
      versionCode: number;
    };
  };
};

test('keeps the CLEVER Driver app identity consistent', () => {
  const appConfig = JSON.parse(
    readFileSync(new URL('../../app.json', import.meta.url), 'utf8'),
  ) as ExpoConfig;

  assert.equal(appConfig.expo.name, 'CLEVER Driver');
  assert.equal(appConfig.expo.owner, 'evandsolution');
  assert.equal(appConfig.expo.slug, 'clever-driver-app');
  assert.equal(appConfig.expo.scheme, 'clever-driver');
  assert.equal(appConfig.expo.version, '0.1.10');
  assert.equal(appConfig.expo.android.versionCode, 11);
  assert.equal(
    appConfig.expo.ios.bundleIdentifier,
    'com.evnsolution.clever.driver',
  );
  assert.equal(
    appConfig.expo.android.package,
    appConfig.expo.ios.bundleIdentifier,
  );
  assert.equal(appConfig.expo.icon, './assets/branding/driver-app-icon.png');
  assert.ok(
    appConfig.expo.android.blockedPermissions.includes(
      'android.permission.SYSTEM_ALERT_WINDOW',
    ),
  );
  assert.deepEqual(appConfig.expo.android.adaptiveIcon, {
    backgroundColor: '#0B57D0',
    foregroundImage: './assets/branding/driver-app-icon-foreground.png',
  });

  const icon = readFileSync(
    new URL('../../assets/branding/driver-app-icon.png', import.meta.url),
  );
  assert.equal(icon.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[25], 2);

  const adaptiveForeground = readFileSync(
    new URL('../../assets/branding/driver-app-icon-foreground.png', import.meta.url),
  );
  assert.equal(adaptiveForeground.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(adaptiveForeground.readUInt32BE(16), 1024);
  assert.equal(adaptiveForeground.readUInt32BE(20), 1024);
  assert.equal(adaptiveForeground[25], 6);
});

test('keeps signed iOS candidates on reviewed EAS profiles', () => {
  const easConfig = JSON.parse(
    readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'),
  ) as {
    build: {
      preview: { distribution: string };
      production: { credentialsSource: string; distribution: string };
    };
  };

  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.production.distribution, 'store');
  assert.equal(easConfig.build.production.credentialsSource, 'remote');
});

test('keeps Google Play submissions on internal testing until promotion', () => {
  const easConfig = JSON.parse(
    readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'),
  ) as {
    build: {
      production: { android: { buildType: string } };
    };
    submit: {
      production: { android: { track: string } };
    };
  };

  assert.equal(easConfig.build.production.android.buildType, 'app-bundle');
  assert.equal(easConfig.submit.production.android.track, 'internal');

  const dynamicConfig = readFileSync(
    new URL('../../app.config.js', import.meta.url),
    'utf8',
  );

  assert.match(dynamicConfig, /process\.env\.GOOGLE_SERVICES_JSON/);
  assert.match(dynamicConfig, /appConfig\.android\.googleServicesFile/);
});
