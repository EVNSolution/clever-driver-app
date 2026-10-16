import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const manifests = ['braces-provenance.json', 'node-forge-provenance.json'];
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function inside(root, path) {
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `Path escapes root: ${path}`);
  return resolved;
}

function gitApply(root, target, patch, checkOnly) {
  const args = ['apply', '--no-index', '--whitespace=error', ...(checkOnly ? ['--check'] : []),
    `--directory=${dirname(target)}`, patch];
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Security patch failed for ${target}: ${result.stderr || result.stdout}`);
}

// Keep npm identities and advisory reporting intact. Only exact reviewed bytes may change.
export function applySecurityPatches(root, { checkOnly = false } = {}) {
  root = realpathSync(root);
  const lock = readJson(resolve(root, 'package-lock.json'));
  assert.equal(lock.lockfileVersion, 3, 'Review security patches before changing lockfile format');
  const pending = [];
  const checked = [];

  for (const manifestFile of manifests) {
    const manifest = readJson(resolve(root, 'patches', manifestFile));
    const patch = inside(resolve(root, 'patches'), manifest.patch);
    assert.equal(sha256(patch), manifest.patchSha256, `Patch checksum differs: ${manifest.patch}`);
    const suffix = `node_modules/${manifest.package}`;
    const targets = Object.keys(lock.packages).filter((path) => path === suffix || path.endsWith(`/${suffix}`));
    assert(targets.length > 0, `Missing locked dependency: ${manifest.package}`);

    for (const target of targets) {
      const packageRoot = inside(root, target);
      assert.equal(realpathSync(packageRoot), packageRoot, `Symlinked patch target: ${target}`);
      const installed = readJson(resolve(packageRoot, 'package.json'));
      assert.equal(installed.name, manifest.package, `Package identity differs: ${target}`);
      assert.equal(installed.version, manifest.version, `Review patch for new version: ${target}`);
      assert.equal(lock.packages[target].version, manifest.version, `Lock version differs: ${target}`);
      const states = manifest.files.map((entry) => {
        const file = inside(packageRoot, entry.path);
        assert(lstatSync(file).isFile(), `Patch target must be a regular file: ${file}`);
        const hash = sha256(file);
        if (hash === entry.afterSha256) return 'patched';
        assert.equal(hash, entry.beforeSha256, `Unexpected dependency contents: ${target}/${entry.path}`);
        return 'original';
      });
      assert(states.length > 0, `Empty patch manifest: ${manifestFile}`);
      assert(states.every((state) => state === states[0]), `Partially applied security patch: ${target}`);
      if (states[0] === 'original') {
        assert(!checkOnly, `Security patch is not installed: ${target}. Run npm ci with scripts enabled.`);
        pending.push({ target, patch, manifest });
      }
      checked.push({ target, manifest });
    }
  }

  // Validate every target before mutating any dependency. Never repair unknown bytes silently.
  for (const entry of pending) gitApply(root, entry.target, entry.patch, true);
  for (const entry of pending) gitApply(root, entry.target, entry.patch, false);
  for (const { target, manifest } of checked) {
    for (const entry of manifest.files) {
      assert.equal(sha256(resolve(root, target, entry.path)), entry.afterSha256,
        `Security patch verification failed: ${target}/${entry.path}`);
    }
  }
  return checked.map(({ target, manifest }) => ({ target, version: manifest.version, patchSha256: manifest.patchSha256 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Usage: apply-dependency-security-patches.mjs [--check]');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const checked = applySecurityPatches(root, { checkOnly: args[0] === '--check' });
    console.log(JSON.stringify({ securityPatches: 'verified', packages: checked }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
