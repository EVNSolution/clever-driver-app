import assert from 'node:assert/strict';
import test from 'node:test';

import { isIsolatedDriverVerification } from './driverIsolatedVerification';

test('synthetic notification checks require explicit isolated verification and a loopback API', () => {
  const enabled = { applicationId: 'com.evnsolution.clever.driver.integration', enabled: 'true', operational: 'true', apiBaseUrl: 'http://127.0.0.1:4908' };
  assert.equal(isIsolatedDriverVerification(enabled), true);
  for (const input of [
    { ...enabled, applicationId: 'com.evnsolution.clever.driver' },
    { ...enabled, applicationId: 'com.evnsolution.clever.driver.integration.other' },
    { ...enabled, applicationId: undefined },
    { ...enabled, enabled: undefined },
    { ...enabled, operational: undefined },
    { ...enabled, apiBaseUrl: 'https://clever-route-api.cleversystem.ai' },
    { ...enabled, apiBaseUrl: 'http://127.0.0.1.example.org:4908' },
    { ...enabled, apiBaseUrl: 'https://localhost:4908' },
    { ...enabled, apiBaseUrl: 'invalid' },
  ]) assert.equal(isIsolatedDriverVerification(input), false);
});
