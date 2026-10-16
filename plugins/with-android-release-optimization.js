const {
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');

const RELEASE_PROPERTIES = [
  'android.enableMinifyInReleaseBuilds',
  'android.enableShrinkResourcesInReleaseBuilds',
];
const DEFAULT_PROGUARD = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZED_PROGUARD = 'getDefaultProguardFile("proguard-android-optimize.txt")';

function setGradleProperty(properties, key, value) {
  const next = [];
  let found = false;

  for (const property of properties) {
    if (property.type !== 'property' || property.key !== key) {
      next.push(property);
      continue;
    }
    if (!found) next.push({ type: 'property', key, value });
    found = true;
  }

  if (!found) next.push({ type: 'property', key, value });
  return next;
}

function useOptimizedProguardDefaults(contents, language) {
  if (language !== 'groovy') {
    throw new Error('Expected a Groovy Android app build file');
  }

  const defaultCount = contents.split(DEFAULT_PROGUARD).length - 1;
  const optimizedCount = contents.split(OPTIMIZED_PROGUARD).length - 1;
  if (defaultCount === 0 && optimizedCount === 1) return contents;
  if (defaultCount !== 1 || optimizedCount !== 0) {
    throw new Error('Expected one Expo ProGuard default in the Android app build file');
  }
  return contents.replace(DEFAULT_PROGUARD, OPTIMIZED_PROGUARD);
}

function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = RELEASE_PROPERTIES.reduce(
      (properties, key) => setGradleProperty(properties, key, 'true'),
      gradleConfig.modResults,
    );
    return gradleConfig;
  });

  return withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = useOptimizedProguardDefaults(
      gradleConfig.modResults.contents,
      gradleConfig.modResults.language,
    );
    return gradleConfig;
  });
}

module.exports = withAndroidReleaseOptimization;
module.exports.setGradleProperty = setGradleProperty;
module.exports.useOptimizedProguardDefaults = useOptimizedProguardDefaults;
