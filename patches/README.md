# Issue #62 dependency patch candidate

This is a review candidate, not an upstream release or a security exception.
Issue [#62](https://github.com/EVNSolution/clever-driver-app/issues/62) remains open.
Change control: [#315](https://github.com/EVNSolution/clever-change-control/issues/315).
The product baseline is PR #67 at `4618905e19ee8229b5baab059d3527ceb34585aa`.

## Scope

| Package | Published base | Pinned upstream patch | Local change |
| --- | --- | --- | --- |
| braces | 3.0.3 | [PR #78](https://github.com/micromatch/braces/pull/78), `97308a01d091b211cf015314a2d0696da28a5392` | Limit parser and AST traversal depth to 100. Reject excess depth with SyntaxError. |
| node-forge | 1.4.0 | [PR #1152](https://github.com/digitalbazaar/forge/pull/1152), `ceba34402e329f0365134f23fe19898756527d65` | Reject extra nested DigestAlgorithm elements during RSA PKCS#1 v1.5 verification. |

Both upstream PRs were open and unmerged on 2026-10-08.
The provenance JSON files contain patch hashes, original and patched file hashes, sources and licenses.
The complete MIT notice for braces and dual-license notice for Forge are retained.
Forge is used under its BSD-3-Clause option.

Only the six braces depth-guard files and Forge `lib/rsa.js` change after installation.
The braces patch excludes unrelated parser changes from the PR's unreleased parent.
Those parent changes have a separate test compatibility record in the validation report.
The depth limit intentionally rejects previously accepted deeply nested patterns.

Forge's Node entry point is `lib/index.js`. Expo CLI and Expo signing tools resolve that entry point.
Forge's prebuilt browser `dist` bundles are **not patched** by this candidate.
Do not import those bundles or describe this candidate as fixing every Forge distribution.
Browser use requires a separate supported build and validation of the distribution bundles.

## Installation and verification

Use the repository CI Node version, currently Node 20.19.4, npm 10.8.2, and Git.

```sh
npm ci
npm run check:security-patches
npm run check:workspace
npm run lint
npx expo install --check
npm run build
npm audit --audit-level=moderate
```

`npm ci` verifies the unchanged registry tarball integrity from `package-lock.json`.
The root `postinstall` validates package identities, versions, patch hashes and original source hashes.
It then applies the reviewed patches with Git and verifies the resulting source hashes.
Every locked copy, including nested copies, must pass verification.
Repeated installation accepts only the exact patched bytes. Unknown or partial contents fail closed.
No new package dependency, package alias, package rename or invented version is introduced.
The lockfile's only functional change marks the root install script.

Do not disable lifecycle scripts. If an environment uses `--ignore-scripts`, the explicit patch check fails.
Run `npm ci` with lifecycle scripts enabled before using Expo or building the app.
The CI workspace check runs this verification before its other checks.
Archives used for installation must include `patches/` and the apply script.

The original package names, versions and advisory identities remain unchanged.
The existing `npm audit --audit-level=moderate` gate is unchanged and still reports these advisories.
A passing source regression test does not make audit pass and does not authorize release.

## Maintenance and rollback

1. Check the official advisories and SDK 56 dependency guidance before a future dependency update.
2. If an official compatible fix exists, remove the corresponding local patch only after validating the new package.
3. Update the provenance, original/patched hashes and regression controls for any intentional patch change.
4. Run a clean install, upstream suites, workspace checks, exports, native build and the unchanged audit gate.
5. Do not weaken the hash checks to accept a changed dependency without review.

To abandon this candidate, revert its dependency-patch commits as one unit and run `npm ci`.
Do not reverse-edit an existing `node_modules` tree or mix old scripts with a new lockfile.
Rollback restores the vulnerable baseline and its security block; it is not a release solution.

Local installation patches do not modify a separately installed EAS CLI or remote worker dependencies.
Remote EAS credentials and version state are outside this change.
The previous version-28 artifacts do not validate the changed dependency installation.
An adopted candidate needs fresh release artifacts and the applicable real-device/Play update checks.
