import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(
  join(tmpdir(), "clever-driver-android-generation-"),
);
const evidenceRoot = process.env.DRIVER_ANDROID_GENERATION_EVIDENCE
  ?? "/tmp/dsv-driver-android-generation-isolation";
const candidateConfig = JSON.parse(readFileSync(join(repositoryRoot, "app.json"), "utf8")).expo;
const template = JSON.parse(readFileSync(join(repositoryRoot, "eas.json"), "utf8"))
  .build.production.android.prebuildCommand.split("--template ")[1];
const excludedNames = new Set([
  ".expo",
  ".git",
  ".private",
  "android",
  "dist",
  "ios",
  "node_modules",
]);

const syntheticFirebase = {
  project_info: {
    project_number: "123456789012",
    project_id: "clever-driver-generation-test",
    storage_bucket: "clever-driver-generation-test.invalid",
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: "1:123456789012:android:0000000000000000",
        android_client_info: {
          package_name: "com.evnsolution.clever.driver",
        },
      },
      api_key: [{ current_key: "synthetic-generation-test-key" }],
    },
  ],
  configuration_version: "1",
};

const runPrebuild = (isolated, clean) => {
  const expo = join(temporaryRoot, "node_modules", ".bin", "expo");
  const args = ["prebuild", "--platform", "android", "--no-install", "--template", template];
  if (clean) args.push("--clean");

  const env = {
    ...process.env,
    NODE_ENV: "production",
  };
  delete env.GOOGLE_SERVICES_JSON;
  delete env.CLEVER_DRIVER_ISOLATED_ANDROID;
  delete env.EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION;
  delete env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED;
  delete env.EXPO_PUBLIC_DSV_API_BASE_URL;
  if (isolated) {
    env.CLEVER_DRIVER_ISOLATED_ANDROID = "true";
    env.EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION = "true";
    env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED = "true";
    env.EXPO_PUBLIC_DSV_API_BASE_URL = "http://127.0.0.1:4908";
  }

  execFileSync(expo, args, {
    cwd: temporaryRoot,
    env,
    stdio: "inherit",
  });
};

const runGuardedPrebuild = (mode) => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
  };
  delete env.GOOGLE_SERVICES_JSON;
  env.CLEVER_DRIVER_ISOLATED_ANDROID = "true";
  env.EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION = "true";
  env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED = "true";
  env.EXPO_PUBLIC_DSV_API_BASE_URL = "http://127.0.0.1:4908";
  execFileSync(process.execPath, ["scripts/prebuild-android.mjs", mode], {
    cwd: temporaryRoot,
    env,
    stdio: "inherit",
  });
};

const readGenerated = () => ({
  gradle: readFileSync(
    join(temporaryRoot, "android", "app", "build.gradle"),
    "utf8",
  ),
  manifest: readFileSync(
    join(temporaryRoot, "android", "app", "src", "main", "AndroidManifest.xml"),
    "utf8",
  ),
});

try {
  rmSync(evidenceRoot, { recursive: true, force: true });
  mkdirSync(evidenceRoot, { recursive: true });
  cpSync(repositoryRoot, temporaryRoot, {
    recursive: true,
    filter: (source) => {
      const name = basename(source);
      if (excludedNames.has(name)) return false;
      return !name.startsWith(".env");
    },
  });
  symlinkSync(
    join(repositoryRoot, "node_modules"),
    join(temporaryRoot, "node_modules"),
  );
  mkdirSync(join(temporaryRoot, ".private"), { recursive: true });
  writeFileSync(
    join(temporaryRoot, ".private", "google-services.json"),
    `${JSON.stringify(syntheticFirebase, null, 2)}\n`,
  );

  runPrebuild(true, true);
  const isolated = readGenerated();
  writeFileSync(
    join(evidenceRoot, "isolated-AndroidManifest.xml"),
    isolated.manifest,
  );
  writeFileSync(join(evidenceRoot, "isolated-build.gradle"), isolated.gradle);
  assert.match(
    isolated.gradle,
    /applicationId\s+["']com\.evnsolution\.clever\.driver\.integration["']/u,
  );
  assert.match(isolated.manifest, /android:usesCleartextTraffic=["']true["']/u);
  assert.equal(
    existsSync(join(temporaryRoot, "android", "app", "google-services.json")),
    false,
  );

  runPrebuild(false, false);
  const production = readGenerated();
  writeFileSync(
    join(evidenceRoot, "production-AndroidManifest.xml"),
    production.manifest,
  );
  writeFileSync(join(evidenceRoot, "production-build.gradle"), production.gradle);
  copyFileSync(
    join(temporaryRoot, "android", "app", "google-services.json"),
    join(evidenceRoot, "production-google-services.synthetic.json"),
  );
  assert.match(
    production.gradle,
    /applicationId\s+["']com\.evnsolution\.clever\.driver["']/u,
  );
  assert.doesNotMatch(
    production.gradle,
    /com\.evnsolution\.clever\.driver\.integration/u,
  );
  assert.doesNotMatch(production.manifest, /android:usesCleartextTraffic/u);
  assert.equal(
    existsSync(join(temporaryRoot, "android", "app", "google-services.json")),
    true,
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        join(temporaryRoot, "android", "app", "google-services.json"),
        "utf8",
      ),
    ),
    syntheticFirebase,
  );

  runGuardedPrebuild("release");
  assert.equal(readFileSync(join(temporaryRoot, "android", ".clever-driver-generation-template"), "utf8").trim(), template);
  assert.equal(
    readFileSync(
      join(temporaryRoot, "android", ".clever-driver-generation-mode"),
      "utf8",
    ),
    "release\n",
  );
  runGuardedPrebuild("integration");
  assert.equal(
    readFileSync(
      join(temporaryRoot, "android", ".clever-driver-generation-mode"),
      "utf8",
    ),
    "integration\n",
  );
  runGuardedPrebuild("integration");
  writeFileSync(
    join(temporaryRoot, "android", "app", "google-services.json"),
    `${JSON.stringify(syntheticFirebase)}\n`,
  );
  runGuardedPrebuild("integration");
  assert.equal(
    existsSync(join(temporaryRoot, "android", "app", "google-services.json")),
    false,
  );

  runGuardedPrebuild("release");
  const guardedRelease = readGenerated();
  assert.match(guardedRelease.gradle, new RegExp(`versionName\\s+"${candidateConfig.version.replaceAll(".", "\\.")}"`, "u"));
  assert.match(guardedRelease.gradle, new RegExp(`versionCode\\s+${candidateConfig.android.versionCode}\\b`, "u"));
  assert.doesNotMatch(guardedRelease.manifest, /android:usesCleartextTraffic/u);
  assert.match(
    guardedRelease.gradle,
    /applicationId\s+["']com\.evnsolution\.clever\.driver["']/u,
  );

  const evidenceFiles = [
    "isolated-AndroidManifest.xml",
    "isolated-build.gradle",
    "production-AndroidManifest.xml",
    "production-build.gradle",
    "production-google-services.synthetic.json",
  ];
  const hashes = Object.fromEntries(
    evidenceFiles.map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(join(evidenceRoot, name)))
        .digest("hex"),
    ]),
  );
  writeFileSync(
    join(evidenceRoot, "result.json"),
    `${JSON.stringify(
      {
        result: "PASS",
        sequence: "isolated clean -> production nonclean",
        releaseEnvironmentContaminationCleared: true,
        syntheticFirebaseOnly: true,
        versionName: candidateConfig.version,
        versionCode: candidateConfig.android.versionCode,
        template,
        hashes,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Android generation isolation: PASS evidence=${evidenceRoot}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
