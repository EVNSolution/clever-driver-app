import assert from 'node:assert/strict';
import test from 'node:test';

import { isolatedDeliveryExceptionReasons } from './driverIsolatedVerification';

test('synthetic report reasons require explicit isolated verification and a loopback API', () => {
  const enabled = { enabled: 'true', operational: 'true', apiBaseUrl: 'http://127.0.0.1:4908' };
  assert.equal(isolatedDeliveryExceptionReasons(enabled)[0]?.code, 'UNDELIVERABLE');
  for (const input of [
    { ...enabled, enabled: undefined },
    { ...enabled, operational: undefined },
    { ...enabled, apiBaseUrl: 'https://clever-route-api.cleversystem.ai' },
    { ...enabled, apiBaseUrl: 'http://127.0.0.1.example.org:4908' },
    { ...enabled, apiBaseUrl: 'invalid' },
  ]) assert.deepEqual(isolatedDeliveryExceptionReasons(input), []);
});
