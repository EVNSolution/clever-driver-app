import assert from 'node:assert/strict';
import { it } from 'node:test';

import { loadDriverExecutionContexts, loadDriverOperationalInbox, startDriverExecution } from '../api/dsvDriverOperational';
import { DriverCommandQueue, type DriverQueuedCommand } from '../domain/delivery/driverCommandQueue';
import { createDriverNotificationRecovery } from '../domain/notifications/driverNotificationRecovery';
import { parseDriverPushNotification } from '../domain/notifications/driverPushNotification';
import { resolveDriverNotificationClick } from './driverNotificationNavigation';

it('connects synthetic publication, warehouse arrival, server T+300 warning, login recovery and explicit atomic approval', async () => {
  const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const context = { executionContextId: uuid(1), routePlanId: uuid(2), routeVersion: 2, assignmentEpoch: '3', assignmentGeneration: '4', expectedRouteVersionId: uuid(3), serviceDate: '2026-10-07', status: 'ACTIVE' as const, startedAt: null as string | null };
  const notifications: { id: string; kind: string; createdAt: string }[] = [];
  const postBodies: Record<string, unknown>[] = [];
  const oldFetch = globalThis.fetch;
  const previousBase = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
  process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'http://127.0.0.1:43199';
  let loseResponse = true;
  globalThis.fetch = async (request, options) => {
    const path = new URL(String(request)).pathname;
    let data: unknown;
    if (path.endsWith('/executions')) data = { items: [context], limit: 100 };
    else if (path.endsWith('/operational-notifications')) data = { items: notifications.map((notification) => ({
      ...notification, ackedAt: null, businessStatus: 'OPEN', expiresAt: '2099-10-07T01:00:00Z', summary: { title: '합성 안내', body: '합성 검증 자료' },
    })), nextCursor: null };
    else if (path.endsWith('/resolve')) data = { notificationId: uuid(6), destination: { type: 'EXECUTION', executionContextId: context.executionContextId, routePlanId: context.routePlanId } };
    else if (path.endsWith('/start')) {
      assert.equal(options?.method, 'POST');
      const body = JSON.parse(String(options?.body)); postBodies.push(body);
      context.startedAt = body.occurredAt;
      if (loseResponse) { loseResponse = false; throw new Error('synthetic connection lost after server commit'); }
      data = { assignmentEpoch: context.assignmentEpoch, commandId: body.commandId, duplicate: true, executionContextId: context.executionContextId, pickupCompletedEventId: uuid(8), routeStartedEventId: uuid(9), routeVersion: context.routeVersion };
    } else throw new Error(`Unexpected endpoint ${path}`);
    return new Response(JSON.stringify({ data, error: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    // These intents are synthetic SERVER progression. The client creates no geofence or reminder timer.
    notifications.push({ id: uuid(4), kind: 'N01', createdAt: '2026-10-07T00:00:00Z' });
    assert.equal((await loadDriverOperationalInbox('synthetic-account-token')).items[0]?.kind, 'N01');
    notifications.push({ id: uuid(5), kind: 'N04', createdAt: '2026-10-07T00:10:00Z' });
    const departure = Date.parse('2026-10-07T00:15:00Z');
    notifications.push({ id: uuid(6), kind: 'N05', createdAt: new Date(departure + 300_000).toISOString() });
    const warning = (await loadDriverOperationalInbox('synthetic-account-token')).items.find((item) => item.kind === 'N05')!;
    assert.equal(Date.parse(warning.createdAt) - departure, 300_000);
    const click = parseDriverPushNotification('native-response', { schemaVersion: '1', kind: 'N05', notificationId: warning.id, expiresAt: warning.expiresAt });
    assert.ok(click);
    const saved = new Map<string, string>();
    const storage = { getItem: async (key: string) => saved.get(key) ?? null, setItem: async (key: string, value: string) => { saved.set(key, value); }, removeItem: async (key: string) => { saved.delete(key); } };
    const coldStart = createDriverNotificationRecovery(storage);
    await coldStart.receiveClick(click);
    assert.equal(coldStart.acquirePending(), null);
    const restarted = createDriverNotificationRecovery(storage);
    await restarted.restore(); await restarted.setAccount(uuid(7));
    const lease = restarted.acquirePending()!;
    const destination = await resolveDriverNotificationClick(lease.notification, 'synthetic-restored-token');
    assert.equal(destination.kind, 'destination');
    const contexts = await loadDriverExecutionContexts('synthetic-restored-token');
    assert.equal(contexts[0]?.executionContextId, context.executionContextId);
    assert.equal(postBodies.length, 0, 'publication/inbox/click/login/navigation reads issue zero business POSTs');
    let persisted: DriverQueuedCommand[] = [];
    const queueOptions = {
      store: { load: async () => structuredClone(persisted), save: async (commands: readonly DriverQueuedCommand[]) => { persisted = structuredClone([...commands]); } },
      getSession: () => ({ accountId: uuid(7), generation: 1 }),
      loadContexts: () => loadDriverExecutionContexts('synthetic-restored-token'),
      createCommandId: () => uuid(10), now: () => '2026-10-07T00:21:00Z',
      send: (command: DriverQueuedCommand) => startDriverExecution('synthetic-restored-token', command.executionContextId, command.payload),
    };
    const queue = new DriverCommandQueue(queueOptions);
    // Only this explicit user action creates the start command.
    const first = await queue.enqueueStart(contexts[0]!);
    assert.equal(first.status, 'pending', 'lost ACK is never shown as success');
    const afterRestart = new DriverCommandQueue(queueOptions);
    await afterRestart.retryPending();
    assert.equal(afterRestart.listForAccount(uuid(7))[0]?.status, 'confirmed');
    assert.equal(postBodies.length, 2);
    assert.deepEqual(postBodies[0], postBodies[1], 'retry/restart preserves commandId, occurredAt and every fence');
    assert.equal(postBodies[1]?.commandId, uuid(10));
    await restarted.accept(lease);
  } finally {
    globalThis.fetch = oldFetch;
    if (previousBase === undefined) delete process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
    else process.env.EXPO_PUBLIC_DSV_API_BASE_URL = previousBase;
  }
});
