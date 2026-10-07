import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type ExpoConfig = {
  expo: {
    icon: string;
    name: string;
    owner: string;
    slug: string;
    version: string;
    ios: {
      bundleIdentifier: string;
      infoPlist: { ITSAppUsesNonExemptEncryption: boolean };
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
  assert.equal(appConfig.expo.version, '0.1.14');
  assert.equal(appConfig.expo.android.versionCode, 23);
  assert.equal(
    appConfig.expo.ios.bundleIdentifier,
    'com.evnsolution.clever.driver',
  );
  assert.equal(
    appConfig.expo.android.package,
    appConfig.expo.ios.bundleIdentifier,
  );
  assert.equal(appConfig.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.equal(appConfig.expo.icon, './assets/branding/driver-app-icon.png');
  assert.ok(
    appConfig.expo.android.blockedPermissions.includes(
      'android.permission.SYSTEM_ALERT_WINDOW',
    ),
  );
  assert.ok(
    appConfig.expo.android.blockedPermissions.includes(
      'android.permission.READ_EXTERNAL_STORAGE',
    ),
  );
  assert.ok(
    appConfig.expo.android.blockedPermissions.includes(
      'android.permission.WRITE_EXTERNAL_STORAGE',
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
    submit: {
      production: { ios: { ascAppId: string } };
    };
  };

  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.production.distribution, 'store');
  assert.equal(easConfig.build.production.credentialsSource, 'remote');
  assert.equal(easConfig.submit.production.ios.ascAppId, '6806955523');
});

test('keeps the Android integration candidate isolated from the business install and Firebase', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };
  const integrationBuild = packageJson.scripts['build:android:integration:apk'];
  const productionBuild = packageJson.scripts['build:android:release:apk'];

  assert.match(integrationBuild, /CLEVER_DRIVER_ISOLATED_ANDROID=true/u);
  assert.match(integrationBuild, /EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION=true/u);
  assert.match(integrationBuild, /node scripts\/prebuild-android\.mjs integration/u);
  assert.match(
    productionBuild,
    /unset CLEVER_DRIVER_ISOLATED_ANDROID EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED EXPO_PUBLIC_DSV_API_BASE_URL/u,
  );
  assert.match(productionBuild, /node scripts\/prebuild-android\.mjs release/u);

  const require = createRequire(import.meta.url);
  const configPath = require.resolve('../../app.config.js');
  const previous = process.env.CLEVER_DRIVER_ISOLATED_ANDROID;

  try {
    delete process.env.CLEVER_DRIVER_ISOLATED_ANDROID;
    delete require.cache[configPath];
    const productionConfig = require(configPath) as {
      android: {
        googleServicesFile?: string;
        package: string;
      };
      name: string;
      plugins: unknown[];
    };
    assert.equal(productionConfig.name, 'CLEVER Driver');
    assert.equal(productionConfig.android.package, 'com.evnsolution.clever.driver');
    assert.equal(productionConfig.android.googleServicesFile, './.private/google-services.json');
    assert.equal(productionConfig.plugins.length, 6);
    assert.equal(typeof productionConfig.plugins.at(-1), 'function');

    process.env.CLEVER_DRIVER_ISOLATED_ANDROID = 'true';
    delete require.cache[configPath];
    const isolatedConfig = require(configPath) as {
      android: {
        googleServicesFile?: string;
        package: string;
      };
      name: string;
      plugins: unknown[];
    };

    assert.equal(isolatedConfig.name, 'CLEVER Driver Integration');
    assert.equal(
      isolatedConfig.android.package,
      'com.evnsolution.clever.driver.integration',
    );
    assert.equal(isolatedConfig.android.googleServicesFile, undefined);
    assert.equal(isolatedConfig.plugins.length, 6);
    assert.equal(typeof isolatedConfig.plugins.at(-1), 'function');
  } finally {
    if (previous === undefined) delete process.env.CLEVER_DRIVER_ISOLATED_ANDROID;
    else process.env.CLEVER_DRIVER_ISOLATED_ANDROID = previous;
    delete require.cache[configPath];
  }
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
