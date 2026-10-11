import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyAudit } from '../audit-allowlist.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const allowlist = JSON.parse(readFileSync(join(here, '..', '..', 'patches', 'audit-allowlist.json'), 'utf8'));
const loadAudit = () => JSON.parse(readFileSync(join(here, 'fixtures', 'npm-audit-issue62.json'), 'utf8'));

test('every Issue #62 audit entry resolves to the two allowlisted advisories', () => {
  const audit = loadAudit();
  const result = classifyAudit(audit, allowlist, '2026-10-11');
  assert.equal(result.expired, false);
  assert.deepEqual(result.unexpected, []);
  assert.equal(result.suppressed.length, Object.keys(audit.vulnerabilities).length);
  assert.equal(audit.metadata.vulnerabilities.high, 20);
  const roots = new Set(result.suppressed.flatMap((entry) => entry.roots));
  assert.deepEqual([...roots].sort(), ['GHSA-86w9-cpqp-85rv', 'GHSA-vfj7-8cjw-p6xm']);
});

test('an advisory outside the allowlist fails together with every entry that depends on it', () => {
  const audit = loadAudit();
  audit.vulnerabilities.micromatch.via.push({
    name: 'micromatch', severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', range: '<=4.0.8'
  });
  const result = classifyAudit(audit, allowlist, '2026-10-11');
  const unexpected = result.unexpected.map((entry) => entry.name);
  assert.ok(unexpected.includes('micromatch'));
  assert.ok(unexpected.includes('expo'));
  assert.ok(!unexpected.includes('node-forge'));
  assert.ok(!unexpected.includes('@expo/code-signing-certificates'));
});

test('an expired allowlist no longer suppresses anything', () => {
  const result = classifyAudit(loadAudit(), allowlist, '2027-01-01');
  assert.equal(result.expired, true);
});
