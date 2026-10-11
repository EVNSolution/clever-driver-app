import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #62: npm audit reports the registry version, so the reviewed source patches
// can never turn the gate green. This gate keeps `npm audit --audit-level=moderate`
// as the source of truth and ignores only the advisories listed in
// patches/audit-allowlist.json, and only while the patches are installed and the
// allowlist has not expired. Every other finding still fails CI.

const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i;

export function readAdvisoryIds(entry) {
  return entry.via
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => GHSA_PATTERN.exec(item.url ?? '')?.[0])
    .filter((id) => id !== undefined);
}

// Resolves every root advisory behind a vulnerability entry by following the
// `via` package names npm uses for transitive entries.
export function resolveRootAdvisories(vulnerabilities, name, visited = new Set()) {
  if (visited.has(name)) return new Set();
  visited.add(name);
  const entry = vulnerabilities[name];
  if (entry === undefined) return new Set();
  const roots = new Set(readAdvisoryIds(entry));
  for (const dependency of entry.via.filter((item) => typeof item === 'string')) {
    for (const id of resolveRootAdvisories(vulnerabilities, dependency, visited)) roots.add(id);
  }
  return roots;
}

export function classifyAudit(audit, allowlist, today) {
  const allowed = new Set(allowlist.advisories.map((advisory) => advisory.ghsa));
  const expired = today > allowlist.expiresOn;
  const suppressed = [];
  const unexpected = [];
  for (const name of Object.keys(audit.vulnerabilities ?? {}).sort()) {
    const roots = [...resolveRootAdvisories(audit.vulnerabilities, name)].sort();
    if (roots.length > 0 && roots.every((id) => allowed.has(id))) suppressed.push({ name, roots });
    else unexpected.push({ name, roots });
  }
  return { expired, suppressed, unexpected };
}

function fail(message, details) {
  console.error(`audit-allowlist: ${message}`);
  if (details !== undefined) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const allowlist = JSON.parse(readFileSync(join(root, 'patches', 'audit-allowlist.json'), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  // The allowlist is only valid while the reviewed source patches are installed.
  const patchCheck = spawnSync(process.execPath, [join(root, 'scripts', 'apply-dependency-security-patches.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
  if (patchCheck.status !== 0) fail('dependency security patches are not verified; the allowlist does not apply', { stdout: patchCheck.stdout, stderr: patchCheck.stderr });
  const patched = JSON.parse(patchCheck.stdout).packages ?? [];
  for (const advisory of allowlist.advisories) {
    const installed = JSON.parse(readFileSync(join(root, advisory.patchTarget, 'package.json'), 'utf8'));
    if (installed.version !== advisory.version) fail(`${advisory.package} ${installed.version} is installed but the allowlist covers ${advisory.version}`);
    if (!patched.some((entry) => entry.target === advisory.patchTarget && entry.version === advisory.version)) fail(`${advisory.patchTarget}@${advisory.version} has no verified patch`);
  }

  const audit = spawnSync('npm', ['audit', '--json', '--audit-level=moderate'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    fail('npm audit did not return JSON', { status: audit.status, stderr: audit.stderr });
  }
  if (report.vulnerabilities === undefined) fail('npm audit did not return a vulnerability report', report);

  const result = classifyAudit(report, allowlist, today);
  console.log(JSON.stringify({
    auditAllowlist: result.expired ? 'expired' : result.unexpected.length === 0 ? 'passed' : 'failed',
    npmAuditExit: audit.status,
    npmAuditCounts: report.metadata?.vulnerabilities,
    allowlistedAdvisories: allowlist.advisories.map((advisory) => advisory.ghsa),
    expiresOn: allowlist.expiresOn,
    suppressedEntries: result.suppressed.map((entry) => entry.name),
    unexpectedEntries: result.unexpected
  }));
  if (result.expired) fail(`allowlist expired on ${allowlist.expiresOn}; re-check the advisories and renew or remove the exceptions`);
  if (result.unexpected.length > 0) fail('npm audit reported advisories outside the allowlist');
  if (audit.status !== 0 && result.suppressed.length === 0) fail('npm audit failed without a readable report', { status: audit.status, stderr: audit.stderr });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
