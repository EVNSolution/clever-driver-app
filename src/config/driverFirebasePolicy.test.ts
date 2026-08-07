import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Driver Firebase Android policy', () => {
  it('uses the protected fixed-project configuration and notification channel', () => {
    const appConfig = readFileSync(join(projectRoot, 'app.json'), 'utf8');
    const manifest = readFileSync(join(projectRoot, 'package.json'), 'utf8');
    const prepareScript = readFileSync(
      join(projectRoot, 'scripts/prepare-driver-firebase.mjs'),
      'utf8',
    );
    const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8');

    assert.match(appConfig, /"googleServicesFile": "\.\/\.private\/google-services\.json"/u);
    assert.match(appConfig, /"defaultChannel": "route-updates"/u);
    assert.match(manifest, /"prepare:firebase:android"/u);
    assert.match(prepareScript, /dlajiin@gmail\.com/u);
    assert.match(prepareScript, /clever-routes-prod/u);
    assert.match(prepareScript, /com\.evnsolution\.clever\.driver/u);
    assert.match(gitignore, /^\/\.private\/$/mu);
  });
});
