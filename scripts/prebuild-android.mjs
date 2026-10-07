import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
assert.ok(
  mode === "integration" || mode === "release",
  "Expected integration or release mode",
);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = join(repositoryRoot, "android");
const markerPath = join(androidRoot, ".clever-driver-generation-mode");
const generatedFirebasePath = join(androidRoot, "app", "google-services.json");
const firebaseSourcePath = resolve(
  repositoryRoot,
  process.env.GOOGLE_SERVICES_JSON ?? ".private/google-services.json",
);
const previousMode = existsSync(markerPath)
  ? readFileSync(markerPath, "utf8").trim()
  : null;
const hasIntegrationFirebaseResidue =
  mode === "integration" && existsSync(generatedFirebasePath);

assert.ok(
  !(hasIntegrationFirebaseResidue && previousMode === null),
  "Unmarked Android tree contains Firebase config; use a separate integration workspace",
);
const clean =
  (previousMode !== null && previousMode !== mode) ||
  hasIntegrationFirebaseResidue;

if (mode === "release") {
  assert.ok(
    existsSync(firebaseSourcePath),
    "Release Firebase config is missing",
  );
}

const expo = join(repositoryRoot, "node_modules", ".bin", "expo");
const args = ["prebuild", "--platform", "android", "--no-install"];
if (clean) args.push("--clean");

const prebuildEnv = { ...process.env };
if (mode === "release") {
  delete prebuildEnv.CLEVER_DRIVER_ISOLATED_ANDROID;
  delete prebuildEnv.EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION;
  delete prebuildEnv.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED;
  delete prebuildEnv.EXPO_PUBLIC_DSV_API_BASE_URL;
}

console.log(`Android prebuild mode=${mode} clean=${clean}`);
execFileSync(expo, args, {
  cwd: repositoryRoot,
  env: prebuildEnv,
  stdio: "inherit",
});

const gradle = readFileSync(join(androidRoot, "app", "build.gradle"), "utf8");
const manifest = readFileSync(
  join(androidRoot, "app", "src", "main", "AndroidManifest.xml"),
  "utf8",
);

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

if (mode === "integration") {
  assert.match(
    gradle,
    /applicationId\s+["']com\.evnsolution\.clever\.driver\.integration["']/u,
  );
  assert.match(manifest, /android:usesCleartextTraffic=["']true["']/u);
  assert.equal(
    existsSync(generatedFirebasePath),
    false,
    "Integration Firebase residue remains",
  );
} else {
  assert.match(
    gradle,
    /applicationId\s+["']com\.evnsolution\.clever\.driver["']/u,
  );
  assert.doesNotMatch(gradle, /com\.evnsolution\.clever\.driver\.integration/u);
  assert.doesNotMatch(manifest, /android:usesCleartextTraffic/u);
  assert.ok(
    existsSync(generatedFirebasePath),
    "Generated release Firebase config is missing",
  );
  assert.equal(
    sha256(generatedFirebasePath),
    sha256(firebaseSourcePath),
    "Generated release Firebase config does not match its source",
  );
}

writeFileSync(markerPath, `${mode}\n`);
