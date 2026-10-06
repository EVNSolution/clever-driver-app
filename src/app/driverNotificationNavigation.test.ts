import assert from 'node:assert/strict';
import { it } from 'node:test';
import { resolveDriverNotificationClick } from './driverNotificationNavigation';

const id = '10000000-0000-4000-8000-000000000001';
const click = { kind: 'N06' as const, notificationId: id, schemaVersion: '1' as const, expiresAt: '2099-10-07T01:00:00Z', status: 'current' as const };
it('clicks resolve only a current server destination and send zero business commands', async () => {
  const calls: string[] = [];
  const result = await resolveDriverNotificationClick(click, 'account-token', async (token, notificationId) => {
    calls.push(`GET:${token}:${notificationId}`);
    return { notificationId: id, destination: { type: 'EXECUTION', executionContextId: id, routePlanId: id, targetStopId: id } };
  });
  assert.deepEqual(calls, [`GET:account-token:${id}`]);
  assert.equal(result.kind, 'destination');
  if (result.kind === 'destination') assert.equal(result.destination.targetStopId, id);
});
it('N03 reveals only release even if a resolver incorrectly returns route details', async () => {
  const result = await resolveDriverNotificationClick({ ...click, kind: 'N03' }, 'token', async () => ({
    notificationId: id, destination: { type: 'EXECUTION', executionContextId: id, routePlanId: id },
  }));
  assert.equal(result.kind, 'notice');
  assert.ok(!JSON.stringify(result).includes('routePlanId'));
});
it('expired and unsupported clicks never request delivery details', async () => {
  let calls = 0;
  const resolve = async () => { calls += 1; throw new Error('unexpected'); };
  assert.equal((await resolveDriverNotificationClick({ ...click, status: 'expired' }, 'token', resolve)).kind, 'notice');
  assert.equal((await resolveDriverNotificationClick({ kind: 'unsupported', notificationId: id, reason: 'UNSUPPORTED_PAYLOAD' }, 'token', resolve)).kind, 'notice');
  assert.equal(calls, 0);
});
it('legacy route and handoff clicks retain refresh behavior', async () => {
  for (const notification of [{ kind: 'route_changed' as const, notificationId: id }, { kind: 'bundle_handoff' as const, notificationId: id, handoffRequestId: id }]) {
    assert.equal((await resolveDriverNotificationClick(notification, 'token', async () => { throw new Error('unexpected'); })).kind, 'refresh');
  }
});
