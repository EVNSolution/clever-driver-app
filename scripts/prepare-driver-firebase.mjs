import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EXPECTED_ACCOUNT = 'dlajiin@gmail.com';
const EXPECTED_APP_RESOURCE =
  'projects/clever-routes-prod/androidApps/1:1087700694992:android:26660f2b20f0f39fe9abd5';
const EXPECTED_PACKAGE = 'com.evnsolution.clever.driver';
const EXPECTED_PROJECT = 'clever-routes-prod';
const DESTINATION = resolve('.private/google-services.json');

function fail(message) {
  console.error(`Firebase Android configuration blocked: ${message}`);
  process.exit(1);
}

function gcloud(...args) {
  try {
    return execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
  } catch {
    fail(`gcloud ${args.join(' ')} failed.`);
  }
}

function validate(config) {
  const packages = (config.client ?? [])
    .map((client) => client.client_info?.android_client_info?.package_name)
    .filter(Boolean);
  if (config.project_info?.project_id !== EXPECTED_PROJECT) {
    fail(`expected Firebase project ${EXPECTED_PROJECT}.`);
  }
  if (!packages.includes(EXPECTED_PACKAGE)) {
    fail(`expected Android package ${EXPECTED_PACKAGE}.`);
  }
}

if (gcloud('config', 'get-value', 'account') !== EXPECTED_ACCOUNT) {
  fail(`active gcloud account must be ${EXPECTED_ACCOUNT}.`);
}
if (gcloud('config', 'get-value', 'project') !== EXPECTED_PROJECT) {
  fail(`active gcloud project must be ${EXPECTED_PROJECT}.`);
}

let config;
const protectedSource = process.env.CLEVER_DRIVER_GOOGLE_SERVICES_FILE?.trim();
if (protectedSource) {
  try {
    config = JSON.parse(readFileSync(protectedSource, 'utf8'));
  } catch {
    fail(`cannot read valid JSON from ${protectedSource}.`);
  }
} else {
  const accessToken = gcloud('auth', 'print-access-token');
  const response = await fetch(
    `https://firebase.googleapis.com/v1beta1/${EXPECTED_APP_RESOURCE}/config`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Goog-User-Project': EXPECTED_PROJECT,
      },
    },
  );
  if (!response.ok) {
    fail(`Firebase Management API returned HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (typeof payload.configFileContents !== 'string') {
    fail('Firebase Management API omitted configFileContents.');
  }
  try {
    config = JSON.parse(Buffer.from(payload.configFileContents, 'base64').toString('utf8'));
  } catch {
    fail('Firebase Management API returned invalid Android configuration.');
  }
}

validate(config);
mkdirSync(dirname(DESTINATION), { recursive: true });
writeFileSync(DESTINATION, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
chmodSync(DESTINATION, 0o600);
console.info(`Firebase Android configuration prepared for ${EXPECTED_PACKAGE}.`);
