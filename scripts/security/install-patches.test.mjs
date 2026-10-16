import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { applySecurityPatches } from '../apply-dependency-security-patches.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifests = ['braces-provenance.json', 'node-forge-provenance.json'].map((name) =>
  JSON.parse(readFileSync(resolve(repo, 'patches', name), 'utf8')));

function fixture(t, { original = false, nested = false } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'driver-security-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(resolve(repo, 'patches'), resolve(root, 'patches'), { recursive: true });
  const packages = {};
  for (const manifest of manifests) {
    for (const prefix of nested ? ['node_modules', 'node_modules/consumer/node_modules'] : ['node_modules']) {
      const target = `${prefix}/${manifest.package}`;
      packages[target] = { version: manifest.version };
      const targetRoot = resolve(root, target);
      mkdirSync(targetRoot, { recursive: true });
      writeFileSync(resolve(targetRoot, 'package.json'), JSON.stringify({ name: manifest.package, version: manifest.version }));
      for (const entry of manifest.files) {
        const file = resolve(targetRoot, entry.path);
        mkdirSync(dirname(file), { recursive: true });
        cpSync(resolve(repo, 'node_modules', manifest.package, entry.path), file);
      }
      if (original) {
        const result = spawnSync('git', ['apply', '--no-index', '--reverse', `--directory=${prefix}`,
          resolve(root, 'patches', manifest.patch)], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
      }
    }
  }
  writeFileSync(resolve(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  return root;
}

test('actual locked dependencies contain every reviewed security patch', () => {
  const checked = applySecurityPatches(repo, { checkOnly: true });
  assert(checked.some(({ target }) => target === 'node_modules/braces'));
  assert(checked.some(({ target }) => target === 'node_modules/node-forge'));
});

test('clean and nested dependencies receive patches, and repeated installation preserves them', (t) => {
  const root = fixture(t, { original: true, nested: true });
  assert.throws(() => applySecurityPatches(root, { checkOnly: true }), /not installed/);
  const applied = applySecurityPatches(root);
  assert.equal(applied.length, 4);
  assert.deepEqual(applySecurityPatches(root), applied);
  assert.deepEqual(applySecurityPatches(root, { checkOnly: true }), applied);
});

test('unknown dependency bytes stop all patches before any dependency is changed', (t) => {
  const root = fixture(t, { original: true });
  const untouched = resolve(root, 'node_modules/braces', manifests[0].files[0].path);
  const before = readFileSync(untouched);
  const changed = resolve(root, 'node_modules/node-forge', manifests[1].files[0].path);
  writeFileSync(changed, `${readFileSync(changed, 'utf8')}\n// unexpected change\n`);
  assert.throws(() => applySecurityPatches(root), /Unexpected dependency contents/);
  assert.deepEqual(readFileSync(untouched), before);
});

test('new dependency versions require an explicit patch review', (t) => {
  const root = fixture(t);
  writeFileSync(resolve(root, 'node_modules/braces/package.json'), JSON.stringify({ name: 'braces', version: '3.0.4' }));
  assert.throws(() => applySecurityPatches(root), /Review patch for new version/);
});

test('changed patch contents fail checksum validation', (t) => {
  const root = fixture(t);
  writeFileSync(resolve(root, 'patches', manifests[0].patch), 'unreviewed patch');
  assert.throws(() => applySecurityPatches(root), /Patch checksum differs/);
});
