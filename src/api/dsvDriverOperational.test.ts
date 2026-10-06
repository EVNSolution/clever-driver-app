import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  acknowledgeDriverOperationalNotification,
  DriverOperationalApiError,
  loadDriverExecutionContexts,
  loadDriverOperationalInbox,
  registerDriverOperationalCapability,
  reportDriverDeliveryException,
  resolveDriverOperationalNotification,
  startDriverExecution,
} from './dsvDriverOperational';

const originalFetch = globalThis.fetch;
const originalBase = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
const id = '11111111-1111-4111-8111-111111111111';
const routeId = '22222222-2222-4222-8222-222222222222';
const childId = '33333333-3333-4333-8333-333333333333';
const commandId = '44444444-4444-4444-8444-444444444444';
const stopId = '55555555-5555-4555-8555-555555555555';
const instant = '2026-10-07T01:02:03.000Z';
const command = {
  assignmentEpoch: '9223372036854775807', assignmentGeneration: '7', commandId,
  expectedRouteVersionId: childId, occurredAt: instant, routeVersion: 3,
};
const execution = {
  executionContextId: id, routePlanId: routeId, routeVersion: 3,
  assignmentEpoch: command.assignmentEpoch, assignmentGeneration: '7',
  expectedRouteVersionId: childId, serviceDate: '2026-10-07', status: 'ACTIVE', startedAt: null,
};
const inboxItem = {
  ackedAt: null, businessStatus: 'OPEN', createdAt: instant,
  expiresAt: '2026-10-07T02:02:03.000Z', id, kind: 'N05',
  summary: { title: '운행 시작 확인이 필요합니다', body: '안전한 곳에서 시작을 확인해 주세요.' },
};
const startResult = {
  assignmentEpoch: command.assignmentEpoch, commandId, duplicate: false,
  executionContextId: id, pickupCompletedEventId: childId,
  routeStartedEventId: routeId, routeVersion: 3,
};
const exceptionResult = {
  assignmentEpoch: command.assignmentEpoch, commandId, duplicate: false,
  exceptionId: childId, executionContextId: id, notificationId: routeId, routeVersion: 3,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, error: null }), { status });
const invalidResponse = (error: unknown) =>
  error instanceof DriverOperationalApiError && error.code === 'INVALID_RESPONSE';

describe('Driver operational API at server af9b4b43', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
    else process.env.EXPO_PUBLIC_DSV_API_BASE_URL = originalBase;
  });

  it('reads contexts, inbox and resolver with zero business POST requests', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const methods: string[] = [];
    globalThis.fetch = async (url, init) => {
      methods.push(init!.method!);
      assert.equal(new Headers(init!.headers).get('Authorization'), 'Bearer account-token');
      if (String(url).endsWith('/executions')) return response({ items: [execution], limit: 100 });
      if (String(url).endsWith('/resolve')) {
        return response({ notificationId: id, destination: {
          type: 'EXECUTION', executionContextId: id, routePlanId: routeId, targetStopId: stopId,
        } });
      }
      assert.match(String(url), /operational-notifications\?limit=30&cursor=cursor%2B%2F%3F%3D$/u);
      return response({ items: [inboxItem], nextCursor: 'cursor+/?=' });
    };
    assert.deepEqual(await loadDriverExecutionContexts('account-token'), [execution]);
    assert.deepEqual(await loadDriverOperationalInbox('account-token', 'cursor+/?='), {
      items: [inboxItem], nextCursor: 'cursor+/?=',
    });
    assert.deepEqual(await resolveDriverOperationalNotification('account-token', id), {
      notificationId: id, destination: {
        type: 'EXECUTION', executionContextId: id, routePlanId: routeId, targetStopId: stopId,
      },
    });
    assert.deepEqual(methods, ['GET', 'GET', 'GET']);
  });

  it('posts one atomic start with both fence sets and caller-owned command identity', async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith(`/executions/${id}/start`));
      assert.equal(init!.method, 'POST');
      bodies.push(JSON.parse(init!.body as string));
      return response({ ...startResult, duplicate: bodies.length > 1 }, bodies.length > 1 ? 200 : 201);
    };
    assert.deepEqual(await startDriverExecution('token', id, command), startResult);
    assert.deepEqual(await startDriverExecution('token', id, command), { ...startResult, duplicate: true });
    assert.deepEqual(bodies, [command, command]);
  });

  it('keeps a lost start response retryable without legacy event fallback', async () => {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      if (calls.length === 1) throw new Error('Response lost after server commit');
      return response({ ...startResult, duplicate: true });
    };
    await assert.rejects(() => startDriverExecution('token', id, command), (error) =>
      error instanceof DriverOperationalApiError && error.status === 0 && error.code === 'NETWORK_ERROR');
    assert.equal((await startDriverExecution('token', id, command)).duplicate, true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.endsWith(`/executions/${id}/start`)));
    assert.deepEqual(calls.map((call) => call.body), [command, command]);
  });

  it('reports an injected synthetic reason without any delivery result event', async () => {
    let calls = 0;
    const report = { ...command, targetStopId: stopId, reasonCode: 'SYNTHETIC_REASON', explanation: '확인 필요' };
    globalThis.fetch = async (url, init) => {
      calls += 1;
      assert.ok(String(url).endsWith(`/executions/${id}/delivery-exceptions`));
      assert.deepEqual(JSON.parse(init!.body as string), report);
      return response(exceptionResult, 201);
    };
    assert.deepEqual(await reportDriverDeliveryException('token', id, report), exceptionResult);
    assert.equal(calls, 1);
  });

  it('accepts only the limited N03 release destination', async () => {
    globalThis.fetch = async () => response({ notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' } });
    assert.deepEqual(await resolveDriverOperationalNotification('token', id), {
      notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' },
    });
    for (const destination of [
      { type: 'ASSIGNMENT_RELEASED', routePlanId: routeId },
      { type: 'OPERATIONS_EXCEPTION', executionContextId: id, reportId: routeId, targetStopId: stopId },
      { type: 'EXECUTION', executionContextId: id, routePlanId: routeId, targetStopId: null },
    ]) {
      globalThis.fetch = async () => response({ notificationId: id, destination });
      await assert.rejects(() => resolveDriverOperationalNotification('token', id), invalidResponse);
    }
  });

  it('sends READ and OPENED acknowledgements as separate non-business requests', async () => {
    const kinds: string[] = [];
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith(`/operational-notifications/${id}/acks`));
      kinds.push(JSON.parse(init!.body as string).ackKind);
      return response({ ackedAt: instant, notificationId: id });
    };
    for (const kind of ['READ', 'OPENED'] as const) {
      assert.deepEqual(await acknowledgeDriverOperationalNotification('token', id, kind), {
        ackedAt: instant, notificationId: id,
      });
    }
    assert.deepEqual(kinds, ['READ', 'OPENED']);
  });

  it('binds capability to the supplied installation and server token ID', async () => {
    const capability = { installationId: 'installation-1', tokenId: routeId, schemaVersion: 1 as const, kinds: ['N01', 'N06'] as const };
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith('/operational-notifications/capability'));
      assert.deepEqual(JSON.parse(init!.body as string), capability);
      return response({ capabilityId: childId, kinds: capability.kinds, schemaVersion: 1 });
    };
    assert.deepEqual(await registerDriverOperationalCapability('token', capability), {
      capabilityId: childId, kinds: ['N01', 'N06'], schemaVersion: 1,
    });
  });

  it('keeps HTTP status and server code but does not expose private server messages', async () => {
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'ASSIGNMENT_CHANGED'], [503, 'DEPENDENCY_UNAVAILABLE']] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ data: null, error: { code, message: 'private detail' } }), { status });
      await assert.rejects(() => startDriverExecution('token', id, command), (error) =>
        error instanceof DriverOperationalApiError && error.status === status && error.code === code
        && !error.message.includes('private detail'));
    }
    globalThis.fetch = async () => new Response('<html>unavailable</html>', { status: 503 });
    await assert.rejects(() => loadDriverExecutionContexts('token'), (error) =>
      error instanceof DriverOperationalApiError && error.status === 503 && error.code === 'HTTP_503');
  });

  it('rejects stale or mismatched command acknowledgements', async () => {
    for (const result of [
      { ...startResult, commandId: id }, { ...startResult, executionContextId: routeId },
      { ...startResult, assignmentEpoch: '8' }, { ...startResult, routeVersion: 4 },
      { ...startResult, duplicate: 'true' }, { ...startResult, routeStartedEventId: '' },
    ]) {
      globalThis.fetch = async () => response(result);
      await assert.rejects(() => startDriverExecution('token', id, command), invalidResponse);
    }
    globalThis.fetch = async () => response({ ...exceptionResult, exceptionId: 'not-a-uuid' });
    await assert.rejects(() => reportDriverDeliveryException('token', id, { ...command, targetStopId: stopId, reasonCode: 'SYNTHETIC_REASON' }), invalidResponse);
  });

  it('rejects malformed context dates, UUIDs and numeric fence substitutions', async () => {
    for (const item of [
      { ...execution, assignmentEpoch: 7 }, { ...execution, assignmentGeneration: '0' },
      { ...execution, assignmentEpoch: '9223372036854775808' },
      { ...execution, expectedRouteVersionId: null }, { ...execution, routePlanId: 'route-1' },
      { ...execution, serviceDate: '2026-02-30' }, { ...execution, startedAt: 'yesterday' },
      { ...execution, routeVersion: 1.2 }, { ...execution, status: 'UNRECOGNIZED' },
      { ...execution, status: ['ACTIVE'] },
    ]) {
      globalThis.fetch = async () => response({ items: [item], limit: 100 });
      await assert.rejects(() => loadDriverExecutionContexts('token'), invalidResponse);
    }
  });

  it('rejects malformed inbox payloads and resolver identity mismatches', async () => {
    for (const item of [
      { ...inboxItem, kind: 'N07' }, { ...inboxItem, businessStatus: 'FAILED' },
      { ...inboxItem, businessStatus: ['OPEN'] },
      { ...inboxItem, expiresAt: '2026-02-30T02:02:03.000Z' },
      { ...inboxItem, ackedAt: 1 }, { ...inboxItem, summary: { title: 'title' } },
    ]) {
      globalThis.fetch = async () => response({ items: [item], nextCursor: null });
      await assert.rejects(() => loadDriverOperationalInbox('token'), invalidResponse);
    }
    globalThis.fetch = async () => response({ notificationId: routeId, destination: { type: 'ASSIGNMENT_RELEASED' } });
    await assert.rejects(() => resolveDriverOperationalNotification('token', id), invalidResponse);
    globalThis.fetch = async () => response({ ackedAt: instant, notificationId: routeId });
    await assert.rejects(() => acknowledgeDriverOperationalNotification('token', id, 'READ'), invalidResponse);
    globalThis.fetch = async () => response({ capabilityId: childId, kinds: ['N01', 'N06'], schemaVersion: 2 });
    await assert.rejects(() => registerDriverOperationalCapability('token', {
      installationId: 'installation-1', tokenId: routeId, schemaVersion: 1, kinds: ['N01'],
    }), invalidResponse);
  });

  it('rejects invalid commands before fetch and never invents fences', async () => {
    globalThis.fetch = async () => { assert.fail('Invalid request must not fetch'); };
    const badRequest = (error: unknown) => error instanceof DriverOperationalApiError && error.status === 400 && error.code === 'BAD_REQUEST';
    for (const patch of [
      { commandId: 'not-a-uuid' }, { assignmentEpoch: '0' }, { assignmentGeneration: '01' },
      { routeVersion: 0 }, { expectedRouteVersionId: '' }, { occurredAt: '2026-02-30T01:02:03.000Z' },
    ]) {
      await assert.rejects(() => startDriverExecution('token', id, { ...command, ...patch }), badRequest);
    }
    await assert.rejects(() => reportDriverDeliveryException('token', id, {
      ...command, targetStopId: stopId, reasonCode: ' ',
    }), badRequest);
    await assert.rejects(() => reportDriverDeliveryException('token', id, {
      ...command, targetStopId: stopId, reasonCode: 'SYNTHETIC_REASON', explanation: 'a'.repeat(1001),
    }), badRequest);
    await assert.rejects(() => registerDriverOperationalCapability('token', {
      installationId: '', tokenId: routeId, schemaVersion: 1, kinds: ['N01'],
    }), badRequest);
    await assert.rejects(() => registerDriverOperationalCapability('token', {
      installationId: 'installation-1', tokenId: routeId, schemaVersion: 1, kinds: ['N01', 'N01'],
    }), badRequest);
    await assert.rejects(() => loadDriverOperationalInbox('token', ''), badRequest);
  });

  it('times out without creating another command or endpoint call', async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      assert.deepEqual(JSON.parse(init!.body as string), command);
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    };
    const pending = startDriverExecution('token', id, command);
    context.mock.timers.tick(20_000);
    await assert.rejects(() => pending, (error) =>
      error instanceof DriverOperationalApiError && error.status === 0 && error.code === 'REQUEST_TIMEOUT');
    assert.equal(calls, 1);
  });
});
