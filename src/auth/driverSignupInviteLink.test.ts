import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readDriverSignupInviteToken } from './driverSignupInviteLink';

const token = 'A'.repeat(43);

describe('driver signup invite links', () => {
  it('accepts only the configured signup deep link and bounded secure token', () => {
    assert.equal(
      readDriverSignupInviteToken(`clever-driver://signup?token=${token}`),
      token,
    );
    assert.equal(readDriverSignupInviteToken(`https://example.test/signup?token=${token}`), null);
    assert.equal(readDriverSignupInviteToken(`clever-driver://login?token=${token}`), null);
    assert.equal(readDriverSignupInviteToken('clever-driver://signup?token=short'), null);
    assert.equal(readDriverSignupInviteToken('not-a-url'), null);
  });
});
