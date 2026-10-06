import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDriverNotificationRecovery } from './driverNotificationRecovery';
import type { DriverNotificationClick } from './driverPushNotification';

const notification: DriverNotificationClick = {
  kind: 'N05', notificationId: '31200000-0000-4000-8000-000000000001',
  expiresAt: '2026-10-07T01:00:00.000Z', schemaVersion: '1', status: 'current',
};
function memoryStorage() {
  let value: string | null = null;
  return { getItem: async (_key: string) => value,
    setItem: async (_key: string, next: string) => { value = next; },
    removeItem: async (_key: string) => { value = null; },
    read: () => value };
}
function recovery(storage = memoryStorage()) {
  return createDriverNotificationRecovery(storage, { now: () => Date.parse('2026-10-07T00:00:00.000Z') });
}

describe('Persistent notification click recovery', () => {
  it('retains a pre-login click through auth recovery and process restart', async () => {
    const storage = memoryStorage();
    const first = recovery(storage);
    await first.restore();
    await first.receiveClick(notification);
    assert.equal(first.acquirePending(), null);
    const restarted = recovery(storage);
    await restarted.restore();
    await restarted.setAccount('account-A');
    const lease = restarted.acquirePending();
    assert.equal(lease?.notification.notificationId, notification.notificationId);
    restarted.release(lease!);
    await restarted.setAccount(null);
    assert.equal(restarted.acquirePending(), null);
    await restarted.setAccount('account-A');
    assert.equal(restarted.acquirePending()?.notification.notificationId, notification.notificationId);
    assert.doesNotMatch(storage.read()!, /accessToken|password|routePlanId|targetStopId/);
  });

  it('deduplicates only accepted destinations and retries unresolved clicks', async () => {
    const state = recovery();
    await state.restore();
    await state.setAccount('account-A');
    await state.receiveClick(notification);
    const unresolved = state.acquirePending()!;
    assert.equal(state.acquirePending(), null);
    assert.equal(await state.receiveClick(notification), false);
    state.release(unresolved);
    const accepted = state.acquirePending()!;
    assert.equal(await state.accept(accepted), true);
    assert.equal(await state.receiveClick(notification), false);
    assert.equal(state.acquirePending(), null);
  });

  it('invalidates late resolution on logout and does not mix account clicks', async () => {
    const storage = memoryStorage();
    const state = recovery(storage);
    await state.restore();
    await state.setAccount('account-A');
    await state.receiveClick(notification);
    const lease = state.acquirePending()!;
    await state.clearForLogout();
    assert.equal(state.isCurrent(lease), false);
    assert.equal(await state.accept(lease), false);
    await state.setAccount('account-B');
    assert.equal(state.acquirePending(), null);
    await state.receiveClick(notification);
    const second = state.acquirePending()!;
    await state.setAccount('account-C');
    assert.equal(state.isCurrent(second), false);
    assert.equal(state.acquirePending(), null);
    assert.equal(await state.accept(second), false);
  });

  it('clears a restored account-bound click when a different account signs in', async () => {
    const storage = memoryStorage();
    const first = recovery(storage);
    await first.restore();
    await first.setAccount('account-A');
    await first.receiveClick(notification);
    const second = recovery(storage);
    await second.restore();
    await second.setAccount('account-B');
    assert.equal(second.acquirePending(), null);
  });

  it('rechecks expiry after restart and safely discards malformed storage', async () => {
    const storage = memoryStorage();
    const first = recovery(storage);
    await first.restore();
    await first.receiveClick(notification);
    const second = createDriverNotificationRecovery(storage, { now: () => Date.parse('2026-10-08T00:00:00.000Z') });
    await second.restore();
    await second.setAccount('account-A');
    const pending = second.acquirePending()?.notification;
    assert.equal(pending?.kind === 'N05' ? pending.status : null, 'expired');
    await storage.setItem('key', '{invalid');
    const corrupt = recovery(storage);
    await corrupt.restore();
    await corrupt.setAccount('account-A');
    assert.equal(corrupt.acquirePending(), null);
  });
});


it('retains successful push deduplication across restart but permits explicit inbox reopening', async () => {
  const storage = memoryStorage();
  const first = recovery(storage);
  await first.restore();
  await first.setAccount('account-A');
  await first.receiveClick(notification);
  await first.accept(first.acquirePending()!);
  const second = recovery(storage);
  await second.restore();
  await second.setAccount('account-A');
  assert.equal(await second.receiveClick(notification), false);
  assert.equal(await second.receiveClick(notification, { reopen: true }), true);
  assert.equal(second.acquirePending()?.notification.notificationId, notification.notificationId);
});

it('invalidates a lease immediately when account suspension begins', async () => {
  const state = recovery();
  await state.restore();
  await state.setAccount('account-A');
  await state.receiveClick(notification);
  const lease = state.acquirePending()!;
  const suspension = state.setAccount(null);
  assert.equal(state.isCurrent(lease), false);
  await suspension;
  assert.equal(await state.accept(lease), false);
});

it('retries receiveClick after storage failure without deduplicating an unsaved click', async () => {
  const base = memoryStorage();
  let fail = false;
  const storage = { ...base, setItem: async (key: string, value: string) => {
    if (fail) throw new Error('storage unavailable');
    await base.setItem(key, value);
  } };
  const state = recovery(storage);
  await state.restore(); await state.setAccount('account-A');
  fail = true;
  await assert.rejects(state.receiveClick(notification), /storage unavailable/u);
  assert.equal(state.acquirePending(), null);
  fail = false;
  assert.equal(await state.receiveClick(notification), true);
  assert.equal(state.acquirePending()?.notification.notificationId, notification.notificationId);
});

it('retains the active lease and pending click when accepted-identity storage fails', async () => {
  const base = memoryStorage();
  let fail = false;
  const storage = { ...base, setItem: async (key: string, value: string) => {
    if (fail) throw new Error('storage unavailable');
    await base.setItem(key, value);
  } };
  const state = recovery(storage);
  await state.restore(); await state.setAccount('account-A'); await state.receiveClick(notification);
  const lease = state.acquirePending()!;
  fail = true;
  await assert.rejects(state.accept(lease), /storage unavailable/u);
  assert.equal(state.isCurrent(lease), true);
  assert.match(base.read()!, /pending.*N05/u);
  fail = false;
  assert.equal(await state.accept(lease), true);
  assert.equal(await state.receiveClick(notification), false);
});

it('keeps logout authoritative when an accepted-identity write finishes late', async () => {
  const base = memoryStorage();
  let finishWrite!: () => void;
  const write = new Promise<void>((resolve) => { finishWrite = resolve; });
  const storage = { ...base, setItem: async (key: string, value: string) => {
    if ((JSON.parse(value) as { accepted: string[] }).accepted.length > 0) await write;
    await base.setItem(key, value);
  } };
  const state = recovery(storage);
  await state.restore(); await state.setAccount('account-A'); await state.receiveClick(notification);
  const lease = state.acquirePending()!;
  const accepted = state.accept(lease);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const logout = state.clearForLogout();
  assert.equal(state.isCurrent(lease), false);
  finishWrite();
  assert.equal(await accepted, false);
  await logout; await state.setAccount('account-B');
  assert.equal(state.acquirePending(), null);
  assert.doesNotMatch(base.read()!, /N05/u);
});

it('keeps a click durable if authentication is suspended during its storage write', async () => {
  const base = memoryStorage();
  let finishWrite!: () => void;
  const write = new Promise<void>((resolve) => { finishWrite = resolve; });
  const storage = { ...base, setItem: async (key: string, value: string) => {
    if ((JSON.parse(value) as { pending: unknown[] }).pending.length > 0) await write;
    await base.setItem(key, value);
  } };
  const state = recovery(storage);
  await state.restore(); await state.setAccount('account-A');
  const received = state.receiveClick(notification);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const suspension = state.setAccount(null);
  finishWrite();
  assert.equal(await received, true);
  await suspension; await state.setAccount('account-A');
  assert.equal(state.acquirePending()?.notification.notificationId, notification.notificationId);
});
