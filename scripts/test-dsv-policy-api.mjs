/**
 * Opt-in actual Driver client / PostgreSQL / HTTP regression.
 * Prerequisite: an exact server PR488 b3710cad archive with its dependencies,
 * generated Prisma client, and all migrations in a NEW disposable local cluster.
 * The server harness checks the exact database URL and uses fake providers.
 * Run: export DSV_OPERATIONAL_DATABASE_URL='postgresql://dsv_operational:dsv_operational@127.0.0.1:55496/dsv_operational?schema=public'
 *   DSV_POLICY_SERVER_SOURCE=/absolute/server/archive \
 *   CLEVER_RUN_DISPOSABLE_DB_TESTS=1 \
 *   DSV_OPERATIONAL_DATABASE_TARGET_CLASS=safe-local-dsv-operational-disposable \
 *   DATABASE_URL="$DSV_OPERATIONAL_DATABASE_URL" node --import tsx scripts/test-dsv-policy-api.mjs
 * Does not start a production server, send providers, or access a device.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const serverSource = process.env.DSV_POLICY_SERVER_SOURCE;
assert(serverSource && isAbsolute(serverSource), 'DSV_POLICY_SERVER_SOURCE must be an absolute server archive path');
assert.equal(process.env.CLEVER_RUN_DISPOSABLE_DB_TESTS, '1', 'Explicit disposable DB opt-in required');
const { createDsvIsolatedHttpHarness } = await import(pathToFileURL(
  join(serverSource, 'apps/delivery-api/tests/support/dsv-isolated-http-harness.ts'),
).href);
const harness = await createDsvIsolatedHttpHarness();
const storageDirectory = await mkdtemp(join(tmpdir(), 'dsv-driver-policy-queue-'));
const originalApiUrl = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
const checks = [];
try {
  const baseUrl = await harness.app.listen({ host: '127.0.0.1', port: 0 });
  process.env.EXPO_PUBLIC_DSV_API_BASE_URL = baseUrl;
  const api = await import('../src/api/dsvDriverOperational.ts');
  const events = await import('../src/api/dsvDriverEvents.ts');
  const routes = await import('../src/api/dsvDriverRoute.ts');
  const { DriverCommandQueue, parseStoredDriverCommands } = await import('../src/domain/delivery/driverCommandQueue.ts');

  async function scenario(name, run) {
    const fixture = await harness.createFixture();
    const context = (await api.loadDriverExecutionContexts(fixture.driverToken))
      .find(({ executionContextId }) => executionContextId === fixture.contextId);
    assert(context, 'Server must return the synthetic execution');
    await run(fixture, context);
    checks.push(name);
    process.stdout.write(`PASS ${name}\n`);
  }

  function payload(context, fixture, reason) {
    return {
      assignmentEpoch: context.assignmentEpoch,
      assignmentGeneration: context.assignmentGeneration,
      commandId: randomUUID(),
      expectedRouteVersionId: context.expectedRouteVersionId,
      occurredAt: '2026-10-08T01:15:00.000Z',
      reason,
      routeVersion: context.routeVersion,
      targetStopId: fixture.stopId,
    };
  }

  function report(fixture, body) {
    return api.reportDriverDeliveryException(fixture.driverToken, fixture.contextId, body);
  }

  async function assertUnchangedOutcome(fixture) {
    const [route, stop, failedOrCompleted] = await Promise.all([
      harness.prisma.routePlan.findUniqueOrThrow({ where: { id: fixture.routePlanId } }),
      harness.prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stopId } }),
      harness.prisma.driverEvent.count({ where: {
        routePlanId: fixture.routePlanId,
        eventType: { in: ['STOP_FAILED', 'STOP_DELIVERED', 'ROUTE_COMPLETED'] },
      } }),
    ]);
    assert.equal(route.status, 'READY');
    assert.equal(stop.status, 'PENDING');
    assert.equal(failedOrCompleted, 0);
  }

  async function assertSingleReport(fixture, commandId, expectedReason) {
    const rows = await harness.prisma.dsvDeliveryException.findMany({ where: { shopId: fixture.shopId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].explanation ?? rows[0].reasonCode, expectedReason);
    assert.equal(rows[0].emailStatus, 'PREPARED');
    assert.equal(rows[0].emailSentAt, null);
    assert.equal(await harness.prisma.dsvExecutionCommand.count({
      where: { commandId, commandName: 'REPORT_DELIVERY_EXCEPTION', shopId: fixture.shopId },
    }), 1);
    assert.equal(await harness.prisma.dsvOperationalNotification.count({
      where: { executionContextId: fixture.contextId, kind: 'N07' },
    }), 1);
    await assertUnchangedOutcome(fixture);
  }

  function diskStore(name) {
    const file = join(storageDirectory, `${name}.json`);
    return {
      async load() {
        try { return parseStoredDriverCommands(JSON.parse(await readFile(file, 'utf8'))); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      },
      async save(commands) { await writeFile(file, JSON.stringify(commands)); },
    };
  }

  await scenario('free-text boundaries, multiline, PREPARED acceptance, no outcome mutation', async (fixture, context) => {
    for (const reason of ['', ' \t\r\n ', '가'.repeat(1001), 'invalid\u0000reason']) {
      await assert.rejects(report(fixture, payload(context, fixture, reason)), { code: 'BAD_REQUEST' });
      // Exercise server validation independently of the app request guard.
      const response = await fetch(`${baseUrl}/api/dsv/driver/executions/${fixture.contextId}/delivery-exceptions`, {
        method: 'POST', headers: { authorization: `Bearer ${fixture.driverToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload(context, fixture, reason)),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(await harness.prisma.dsvDeliveryException.count({ where: { shopId: fixture.shopId } }), 0);
    const reason = `현장 부재\n연락 불가\t${'가'.repeat(988)}`;
    assert.equal(reason.length, 1000);
    const command = payload(context, fixture, `  ${reason}  `);
    const receipt = await report(fixture, command);
    assert.equal(receipt.reportStatus, 'ACCEPTED');
    assert.equal(receipt.emailStatus, 'PREPARED');
    assert.equal(receipt.duplicate, false);
    await assertSingleReport(fixture, command.commandId, reason);
  });

  await scenario('concurrent duplicates and changed-body conflict keep one report and mail job', async (fixture, context) => {
    const command = payload(context, fixture, '수취인 부재로 연락 후 다시 방문합니다.');
    const receipts = await Promise.all([report(fixture, command), report(fixture, command)]);
    assert.deepEqual(receipts.map(({ duplicate }) => duplicate).sort(), [false, true]);
    assert.equal(receipts[0].exceptionId, receipts[1].exceptionId);
    await assert.rejects(report(fixture, { ...command, reason: '다른 보고 본문' }), {
      status: 409, code: 'COMMAND_CONFLICT',
    });
    await assertSingleReport(fixture, command.commandId, command.reason);
  });

  await scenario('lost response, offline retry, disk reload preserve the entire command body', async (fixture, context) => {
    const store = diskStore('response-loss');
    let online = true;
    let loseResponse = true;
    const bodies = [];
    const createQueue = () => new DriverCommandQueue({
      createCommandId: randomUUID,
      getSession: () => ({ accountId: fixture.accountId, generation: 1 }),
      loadContexts: () => {
        if (!online) throw Object.assign(new Error('synthetic offline'), { code: 'NETWORK_ERROR', status: 0 });
        return api.loadDriverExecutionContexts(fixture.driverToken);
      },
      now: () => '2026-10-08T01:15:00.000Z',
      send: async (command) => {
        bodies.push(JSON.stringify(command.payload));
        const result = await report(fixture, command.payload);
        if (loseResponse) {
          loseResponse = false;
          throw Object.assign(new Error('synthetic response loss after commit'), { code: 'NETWORK_ERROR', status: 0 });
        }
        return result;
      },
      store,
    });
    const first = createQueue();
    await first.initialize();
    const pending = await first.enqueueDeliveryException(context, { targetStopId: fixture.stopId, reason: '배송지 폐문\n관리자 연락 대기' });
    assert.equal(pending.status, 'pending');
    const original = (await store.load())[0].payload;
    online = false;
    const offlineRestart = createQueue();
    await offlineRestart.initialize();
    await offlineRestart.retryPending();
    assert.equal((await store.load())[0].status, 'pending');
    assert.deepEqual((await store.load())[0].payload, original);
    online = true;
    const onlineRestart = createQueue();
    await onlineRestart.initialize();
    await onlineRestart.retryPending();
    const confirmed = (await store.load())[0];
    assert.equal(confirmed.status, 'confirmed');
    assert.deepEqual(confirmed.payload, original);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    await assertSingleReport(fixture, original.commandId, original.reason);
  });

  await scenario('legacy stored reasonCode and explanation replay without body migration', async (fixture, context) => {
    const store = diskStore('legacy');
    const { reason: _reason, ...common } = payload(context, fixture, 'unused');
    const legacy = { ...common, reasonCode: 'UNDELIVERABLE', explanation: '  이전 앱에서 저장한 보고  ' };
    const originalReceipt = await report(fixture, legacy);
    assert.equal(originalReceipt.duplicate, false);
    await store.save([{
      accountId: fixture.accountId, attempts: 1, executionContextId: fixture.contextId,
      lastError: 'NETWORK_ERROR', payload: legacy, status: 'pending', type: 'REPORT_DELIVERY_EXCEPTION',
    }]);
    let replayReceipt;
    const restarted = new DriverCommandQueue({
      createCommandId: () => { throw new Error('A saved command must retain its ID'); },
      getSession: () => ({ accountId: fixture.accountId, generation: 1 }),
      loadContexts: () => api.loadDriverExecutionContexts(fixture.driverToken),
      send: async (command) => { replayReceipt = await report(fixture, command.payload); return replayReceipt; },
      store,
    });
    await restarted.initialize();
    await restarted.retryPending();
    assert.equal(replayReceipt.duplicate, true);
    assert.equal((await store.load())[0].status, 'confirmed');
    assert.deepEqual((await store.load())[0].payload, legacy);
    await assertSingleReport(fixture, legacy.commandId, legacy.explanation.trim());
  });

  await scenario('assignment fencing blocks a stored command without rewriting its body', async (fixture, context) => {
    const store = diskStore('fence-change');
    const saved = payload(context, fixture, '배정 변경 전에 작성한 보고');
    await store.save([{
      accountId: fixture.accountId, attempts: 0, executionContextId: fixture.contextId,
      lastError: 'NETWORK_ERROR', payload: saved, status: 'pending', type: 'REPORT_DELIVERY_EXCEPTION',
    }]);
    await harness.prisma.dsvExecutionContext.update({
      data: { assignmentEpoch: { increment: 1 } }, where: { id: fixture.contextId },
    });
    const restarted = new DriverCommandQueue({
      createCommandId: randomUUID,
      getSession: () => ({ accountId: fixture.accountId, generation: 1 }),
      loadContexts: () => api.loadDriverExecutionContexts(fixture.driverToken),
      send: async () => { throw new Error('A stale command must not be sent'); },
      store,
    });
    await restarted.initialize();
    await restarted.retryPending();
    assert.equal((await store.load())[0].status, 'blocked');
    assert.equal((await store.load())[0].lastError, 'FENCE_CHANGED');
    assert.deepEqual((await store.load())[0].payload, saved);
    assert.equal(await harness.prisma.dsvDeliveryException.count({ where: { shopId: fixture.shopId } }), 0);
  });

  await scenario('notification resolution, photo-free completion, lost result recovery after reassignment', async (fixture, context) => {
    // The notification harness has only legacy destination text. Completion needs
    // the canonical destination relation created by an actual dispatch import.
    const destination = await harness.prisma.deliveryCustomerProfile.create({ data: {
      addressFingerprint: `policy-fixture:${randomUUID()}`, canonicalName: 'Synthetic policy destination',
      normalizedAddress: {}, shopId: fixture.shopId,
    } });
    await harness.prisma.order.update({ data: { destinationId: destination.id }, where: { id: fixture.orderId } });
    const inbox = await api.loadDriverOperationalInbox(fixture.driverToken);
    assert(inbox.items.some(({ id, kind }) => id === fixture.n06NotificationId && kind === 'N06'));
    const resolution = await api.resolveDriverOperationalNotification(fixture.driverToken, fixture.n06NotificationId);
    assert.equal(resolution.destination.targetStopId, fixture.stopId);
    const route = await routes.loadDriverDeliveryRoute(fixture.driverToken, fixture.routePlanId);
    const stop = route.orders.find(({ id }) => id === fixture.stopId);
    assert(stop);
    const { targetStopId: _target, reason: _reason, ...start } = payload(context, fixture, 'unused');
    await api.startDriverExecution(fixture.driverToken, fixture.contextId, start);
    const identity = { clientEventId: `policy-completion:${randomUUID()}`, occurredAt: '2026-10-08T01:20:00.000Z' };
    const originalFetch = globalThis.fetch;
    let completionResponse;
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).endsWith('/driver/destinations/complete')) {
        completionResponse = { status: response.status, body: await response.clone().json() };
        if (!response.ok) return response;
        throw new Error('synthetic lost completion response after commit');
      }
      return response;
    };
    try {
      await assert.rejects(events.completeDriverDeliveryDestination(
        route.routeAccessToken, fixture.routePlanId, stop.destinationId, [fixture.stopId], identity,
      ), { code: 'COMPLETION_OUTCOME_UNKNOWN', outcome: 'unknown' });
    } finally { globalThis.fetch = originalFetch; }
    assert.equal(completionResponse.status, 202, JSON.stringify(completionResponse.body));
    assert.equal((await harness.prisma.deliveryStop.findUniqueOrThrow({ where: { id: fixture.stopId } })).status, 'DELIVERED');
    // Current route access can disappear; the account-scoped receipt is still authoritative.
    await harness.prisma.routePlan.update({ data: { driverId: null }, where: { id: fixture.routePlanId } });
    assert.equal(await events.lookupDriverDeliveryCompletionResult(
      fixture.driverToken, fixture.routePlanId, stop.destinationId, [fixture.stopId], identity,
    ), true);
    assert.equal(await harness.prisma.driverEvent.count({
      where: { deliveryStopId: fixture.stopId, eventType: 'STOP_DELIVERED', routePlanId: fixture.routePlanId },
    }), 1);
  });

  process.stdout.write(`${JSON.stringify({ checks, count: checks.length, database: 'isolated PostgreSQL', transport: 'loopback HTTP' })}\n`);
} finally {
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
  else process.env.EXPO_PUBLIC_DSV_API_BASE_URL = originalApiUrl;
  await harness.close();
  await rm(storageDirectory, { recursive: true, force: true });
}
