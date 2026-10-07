import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DriverOperationalApiError, type DriverNotificationResolution } from '../api/dsvDriverOperational';
import { classifyDriverNotificationClick } from '../domain/notifications/driverPushNotification';
import { createDriverNotificationRecovery } from '../domain/notifications/driverNotificationRecovery';
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

it('rejects missing or malformed N06 deliveryStopId without a route fallback or OPENED eligibility', async () => {
  for (const targetStopId of [
    undefined, null, '', ' ', 123, 'delivery-stop-A',
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-8000-000000000001',
    '10000000-0000-4000-0000-000000000001',
  ]) {
    const result = await resolveDriverNotificationClick(click, 'token', async () => ({
      notificationId: id,
      destination: { type: 'EXECUTION', executionContextId: id, routePlanId: id,
        ...(targetStopId === undefined ? {} : { targetStopId }) },
    }) as unknown as DriverNotificationResolution);
    assert.equal(result.kind, 'notice');
    if (result.kind === 'notice') assert.equal(result.acknowledgeOpened, false);
    assert.ok(!JSON.stringify(result).includes('routePlanId'));
    assert.ok(!JSON.stringify(result).includes('targetStopId'));
  }
});

it('accepts route-level N01, N02, N04 and N05 without an N06 target', async () => {
  for (const kind of ['N01', 'N02', 'N04', 'N05'] as const) {
    const result = await resolveDriverNotificationClick({ ...click, kind }, 'token', async () => ({
      notificationId: id, destination: { type: 'EXECUTION', executionContextId: id, routePlanId: id },
    }));
    assert.equal(result.kind, 'destination');
  }
});

it('permits OPENED only for a resolved release notice', async () => {
  const released = await resolveDriverNotificationClick({ ...click, kind: 'N03' }, 'token', async () => ({
    notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' },
  }));
  assert.equal(released.kind, 'notice');
  if (released.kind === 'notice') assert.equal(released.acknowledgeOpened, true);
  for (const notification of [
    { ...click, status: 'expired' as const },
    { kind: 'unsupported' as const, notificationId: id, reason: 'UNSUPPORTED_PAYLOAD' as const },
  ]) {
    const result = await resolveDriverNotificationClick(notification, 'token', async () => { throw new Error('unexpected'); });
    assert.equal(result.kind, 'notice');
    if (result.kind === 'notice') assert.equal(result.acknowledgeOpened, false);
  }
});


it('converts a rejected malformed N06 success response into a non-acknowledgeable notice', async () => {
  const result = await resolveDriverNotificationClick(click, 'token', async () => {
    throw new DriverOperationalApiError(200, 'INVALID_RESPONSE');
  });
  assert.equal(result.kind, 'notice');
  if (result.kind === 'notice') assert.equal(result.acknowledgeOpened, false);
  for (const error of [new DriverOperationalApiError(401, 'AUTH_REQUIRED'), new DriverOperationalApiError(0, 'NETWORK_ERROR')]) {
    await assert.rejects(resolveDriverNotificationClick(click, 'token', async () => { throw error; }), (caught) => caught === error);
  }
});

it('ends an unsupported invalid-UUID click after notice acceptance without a resolver retry across restart', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  const recovery = createDriverNotificationRecovery(storage);
  await recovery.restore(); await recovery.setAccount('account-A');
  const unsupported = classifyDriverNotificationClick('provider-id', {
    kind: 'N06', schemaVersion: '1', expiresAt: click.expiresAt, notificationId: '00000000-0000-0000-0000-000000000000',
  });
  await recovery.receiveClick(unsupported);
  const lease = recovery.acquirePending(); assert.ok(lease);
  let resolverCalls = 0;
  const result = await resolveDriverNotificationClick(lease.notification, 'token', async () => {
    resolverCalls += 1; throw new Error('unsupported click must not resolve');
  });
  assert.equal(result.kind, 'notice');
  if (result.kind === 'notice') assert.equal(result.acknowledgeOpened, false);
  assert.equal(resolverCalls, 0);
  await recovery.accept(lease);
  const restarted = createDriverNotificationRecovery(storage);
  await restarted.restore(); await restarted.setAccount('account-A');
  assert.equal(restarted.acquirePending(), null);
  assert.equal(await restarted.receiveClick(unsupported), false);
});

it('does not treat a targetless release response as an acknowledgeable N06 destination', async () => {
  const result = await resolveDriverNotificationClick(click, 'token', async () => ({
    notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' },
  }));
  assert.equal(result.kind, 'notice');
  if (result.kind === 'notice') assert.equal(result.acknowledgeOpened, false);
});
