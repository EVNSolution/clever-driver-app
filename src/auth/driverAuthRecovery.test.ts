import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthApiError } from '../api/dsvDriverAuth';
import {
  AUTO_LOGIN_RETRY_DELAY_MS,
  resolveDriverAuthRecoveryAction,
} from './driverAuthRecovery';

describe('driver authentication recovery', () => {
  it('discards only an expired refresh session', () => {
    assert.equal(
      resolveDriverAuthRecoveryAction(
        new AuthApiError('SESSION_EXPIRED', 'expired'),
      ),
      'discard',
    );
  });

  it('retries temporary API and network failures without deleting the session', () => {
    assert.equal(
      resolveDriverAuthRecoveryAction(
        new AuthApiError('SERVICE_UNAVAILABLE', 'deploying'),
      ),
      'retry',
    );
    assert.equal(resolveDriverAuthRecoveryAction(new TypeError('Network request failed')), 'retry');
    assert.equal(AUTO_LOGIN_RETRY_DELAY_MS, 5_000);
  });
});
