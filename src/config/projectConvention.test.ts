import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type ExpoConfig = {
  expo: {
    name: string;
    slug: string;
    scheme: string;
    ios: {
      bundleIdentifier: string;
    };
    android: {
      package: string;
    };
  };
};

test('keeps the CLEVER Driver app identity consistent', () => {
  const appConfig = JSON.parse(
    readFileSync(new URL('../../app.json', import.meta.url), 'utf8'),
  ) as ExpoConfig;

  assert.equal(appConfig.expo.name, 'CLEVER Driver');
  assert.equal(appConfig.expo.slug, 'clever-driver-app');
  assert.equal(appConfig.expo.scheme, 'clever-driver');
  assert.equal(
    appConfig.expo.ios.bundleIdentifier,
    'com.evnsolution.clever.driver',
  );
  assert.equal(
    appConfig.expo.android.package,
    appConfig.expo.ios.bundleIdentifier,
  );
});
