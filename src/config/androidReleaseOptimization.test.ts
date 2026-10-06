import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

type GradleProperty =
  | { type: 'comment'; value: string }
  | { type: 'empty' }
  | { type: 'property'; key: string; value: string };

type AndroidReleaseOptimizationPlugin = {
  setGradleProperty(
    properties: GradleProperty[],
    key: string,
    value: string,
  ): GradleProperty[];
  useOptimizedProguardDefaults(contents: string, language: string): string;
};

const plugin = require(
  '../../plugins/with-android-release-optimization.js',
) as AndroidReleaseOptimizationPlugin;

test('enables release optimization properties exactly once', () => {
  const original: GradleProperty[] = [
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    { type: 'comment', value: 'release settings' },
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
  ];

  const once = plugin.setGradleProperty(
    original,
    'android.enableMinifyInReleaseBuilds',
    'true',
  );
  const twice = plugin.setGradleProperty(
    once,
    'android.enableMinifyInReleaseBuilds',
    'true',
  );
  const matching = twice.filter(
    (property) => property.type === 'property'
      && property.key === 'android.enableMinifyInReleaseBuilds',
  );

  assert.deepEqual(twice, once);
  assert.deepEqual(matching, [{
    type: 'property',
    key: 'android.enableMinifyInReleaseBuilds',
    value: 'true',
  }]);
});

test('uses the optimized default ProGuard rules idempotently', () => {
  const original = `release {
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
  }`;
  const optimized = plugin.useOptimizedProguardDefaults(original, 'groovy');

  assert.match(optimized, /proguard-android-optimize\.txt/u);
  assert.doesNotMatch(optimized, /proguard-android\.txt/u);
  assert.equal(
    plugin.useOptimizedProguardDefaults(optimized, 'groovy'),
    optimized,
  );
});

test('fails if the generated Android template no longer matches', () => {
  assert.throws(
    () => plugin.useOptimizedProguardDefaults('release { minifyEnabled true }', 'groovy'),
    /Expected one Expo ProGuard default/u,
  );
  assert.throws(
    () => plugin.useOptimizedProguardDefaults('android { }', 'kotlin'),
    /Groovy Android app build file/u,
  );
});
