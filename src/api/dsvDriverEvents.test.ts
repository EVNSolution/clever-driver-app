import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  acknowledgeDriverTimeConstraint,
  completeDriverDeliveryDestination,
  completeDriverDeliveryRoute,
  DriverDeliveryCompletionApiError,
  lookupDriverDeliveryCompletionResult,
  markDriverOrderMessageRead,
  startDriverDeliveryRoute,
} from './dsvDriverEvents';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver events API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('records all orders at the server-selected destination in one request', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: { completedStopCount: 2, eventIds: ['event-1', 'event-2'] },
        error: null,
      }));
    };

    await completeDriverDeliveryDestination(
      'route-token',
      'route-1',
      'destination-1',
      ['stop-1', 'stop-2'],
      { clientEventId: 'destination-1:delivered:stable', occurredAt: '2026-09-10T05:42:00.000Z' },
    );

    assert.equal(request?.input, 'https://dsv.example.test/driver/destinations/complete');
    assert.equal(request?.init?.method, 'POST');
    assert.equal(
      (request?.init?.headers as Record<string, string>).Authorization,
      'Bearer route-token',
    );
    const body = JSON.parse(request?.init?.body as string) as Record<string, unknown>;
    assert.equal(body.destinationId, 'destination-1');
    assert.deepEqual(body.deliveryStopIds, ['stop-1', 'stop-2']);
    assert.equal(body.occurredAt, '2026-09-10T05:42:00.000Z');
    assert.equal('eventType' in body, false);
  });

  it('starts the route before recording pickup completion', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const requests: { input: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ input: input.toString(), init });
      return new Response(JSON.stringify({
        data: { eventId: `event-${requests.length}` },
        error: null,
      }));
    };

    await startDriverDeliveryRoute('route-token', 'route-1');

    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map((request) => JSON.parse(request.init?.body as string).eventType),
      ['ROUTE_STARTED', 'PICKUP_COMPLETED'],
    );
    for (const request of requests) {
      assert.equal(request.input, 'https://dsv.example.test/driver/events');
      assert.equal(request.init?.method, 'POST');
      assert.equal(
        (request.init?.headers as Record<string, string>).Authorization,
        'Bearer route-token',
      );
      const body = JSON.parse(request.init?.body as string) as Record<string, unknown>;
      assert.equal(body.routePlanId, 'route-1');
      assert.equal('deliveryStopId' in body, false);
    }
    const pickupBody = JSON.parse(requests[1]?.init?.body as string) as Record<string, unknown>;
    assert.match(pickupBody.clientEventId as string, /^route-1:pickup:/u);
  });

  it('reuses destination completion identity and time when an accepted response is lost', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const bodies: unknown[] = [];
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(init?.body as string));
      if (bodies.length === 1) throw new Error('accepted response lost');
      return new Response(JSON.stringify({ data: { completedStopCount: 1, eventIds: ['event-1'] }, error: null }));
    };
    const identity = { clientEventId: 'destination-1:delivered:stable', occurredAt: '2026-10-07T08:00:00.000Z' };
    await assert.rejects(
      completeDriverDeliveryDestination('route-token', 'route-1', 'destination-1', ['stop-1'], identity),
      (error: unknown) => error instanceof DriverDeliveryCompletionApiError
        && error.status === 0 && error.outcome === 'unknown',
    );
    await completeDriverDeliveryDestination('route-token', 'route-1', 'destination-1', ['stop-1'], identity);
    assert.deepEqual(bodies[1], bodies[0]);
    assert.deepEqual(bodies[1], { ...identity, routePlanId: 'route-1', destinationId: 'destination-1', deliveryStopIds: ['stop-1'] });
  });

  for (const status of [400, 403, 409]) {
    it(`preserves HTTP ${status} status and code for a confirmed not-applied completion rejection`, async () => {
      process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
      globalThis.fetch = async () => new Response(JSON.stringify({
        data: null,
        error: { code: 'DESTINATION_SCOPE_REJECTED', completionOutcome: 'NOT_APPLIED', message: 'Original destination was not applied' },
      }), { status });

      await assert.rejects(
        completeDriverDeliveryDestination('route-token', 'route-1', 'destination-1', ['stop-1'], {
          clientEventId: 'first-rejection', occurredAt: '2026-10-07T06:00:00.000Z',
        }),
        (error: unknown) => error instanceof DriverDeliveryCompletionApiError
          && error.status === status && error.code === 'DESTINATION_SCOPE_REJECTED'
          && error.outcome === 'rejected' && error.message === 'Original destination was not applied',
      );
    });
  }

  for (const failure of [
    { name: 'untagged scope rejection', status: 403, body: { data: null, error: { code: 'FORBIDDEN', message: 'Assignment changed' } } },
    { name: 'unverified outcome tag', status: 409, body: { data: null, error: { code: 'CONFLICT', completionOutcome: 'PARTIAL' } } },
    { name: 'server failure without an outcome tag', status: 500, body: { data: null, error: { code: 'INTERNAL_ERROR' } } },
    { name: 'missing acceptance payload', status: 202, body: { data: null, error: null } },
    { name: 'incomplete stop acceptance', status: 202, body: { data: { completedStopCount: 1, eventIds: ['event-1'] }, error: null } },
    { name: 'invalid event identifiers', status: 200, body: { data: { completedStopCount: 2, eventIds: ['event-1', null] }, error: null } },
    { name: 'duplicate stop event identifiers', status: 200, body: { data: { completedStopCount: 2, eventIds: ['event-1', 'event-1'] }, error: null } },
    { name: 'error envelope on a successful HTTP status', status: 200, body: { data: null, error: { code: 'FORBIDDEN', completionOutcome: 'NOT_APPLIED' } } },
    { name: 'non-object envelope', status: 403, body: [] },
  ]) {
    it(`keeps ${failure.name} unknown instead of permitting a new completion identity`, async () => {
      process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
      globalThis.fetch = async () => new Response(JSON.stringify(failure.body), { status: failure.status });
      await assert.rejects(
        completeDriverDeliveryDestination('route-token', 'route-1', 'destination-1', ['stop-1', 'stop-2'], {
          clientEventId: 'possibly-applied', occurredAt: '2026-10-07T06:00:00.000Z',
        }),
        (error: unknown) => error instanceof DriverDeliveryCompletionApiError
          && error.status === failure.status && error.outcome === 'unknown',
      );
    });
  }

  it('keeps invalid JSON completion responses unknown', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response('not-json', { status: 403 });
    await assert.rejects(
      completeDriverDeliveryDestination('route-token', 'route-1', 'destination-1', ['stop-1'], {
        clientEventId: 'invalid-json', occurredAt: '2026-10-07T06:00:00.000Z',
      }),
      (error: unknown) => error instanceof DriverDeliveryCompletionApiError
        && error.status === 403 && error.code === 'INVALID_COMPLETION_RESPONSE' && error.outcome === 'unknown',
    );
  });

  it('checks an applied original command with the account token and the full original fingerprint', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    const identity = { clientEventId: 'original-applied-command', occurredAt: '2026-10-07T06:00:00.000Z' };
    globalThis.fetch = async (input, init) => {
      request = { input: String(input), init };
      return new Response(JSON.stringify({ data: {
        ...identity, status: 'APPLIED', routePlanId: 'original-route', destinationId: 'original-destination',
        deliveryStopIds: ['stop-2', 'stop-1'], completedStopCount: 2, eventIds: ['event-1', 'event-2'],
      }, error: null }));
    };

    assert.equal(await lookupDriverDeliveryCompletionResult('account-jwt', 'original-route', 'original-destination', ['stop-1', 'stop-2'], identity), true);
    assert.equal(request?.input, 'https://dsv.example.test/driver/destinations/complete/result');
    assert.equal(request?.init?.method, 'POST');
    assert.equal((request?.init?.headers as Record<string, string>).Authorization, 'Bearer account-jwt');
    assert.deepEqual(JSON.parse(request?.init?.body as string), {
      ...identity, routePlanId: 'original-route', destinationId: 'original-destination', deliveryStopIds: ['stop-1', 'stop-2'],
    });
  });

  for (const mismatch of [
    { name: 'client event identity', receipt: { clientEventId: 'another-command' } },
    { name: 'submitted completion time', receipt: { occurredAt: '2026-10-07T06:01:00.000Z' } },
    { name: 'original route', receipt: { routePlanId: 'current-route' } },
    { name: 'original destination', receipt: { destinationId: 'current-destination' } },
    { name: 'all original stops', receipt: { deliveryStopIds: ['stop-1', 'foreign-stop'] } },
    { name: 'duplicate original stops', receipt: { deliveryStopIds: ['stop-1', 'stop-1'] } },
    { name: 'complete stop count', receipt: { completedStopCount: 1 } },
    { name: 'complete event count', receipt: { eventIds: ['event-1'] } },
    { name: 'distinct events', receipt: { eventIds: ['event-1', 'event-1'] } },
    { name: 'event identifiers', receipt: { eventIds: ['event-1', ''] } },
    { name: 'applied status', receipt: { status: 'UNKNOWN' } },
  ]) {
    it(`does not confirm an applied receipt with mismatched ${mismatch.name}`, async () => {
      process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
      const identity = { clientEventId: 'original-command', occurredAt: '2026-10-07T06:00:00.000Z' };
      globalThis.fetch = async () => new Response(JSON.stringify({ data: {
        ...identity, status: 'APPLIED', routePlanId: 'original-route', destinationId: 'original-destination',
        deliveryStopIds: ['stop-1', 'stop-2'], completedStopCount: 2, eventIds: ['event-1', 'event-2'],
        ...mismatch.receipt,
      }, error: null }));
      assert.equal(await lookupDriverDeliveryCompletionResult('account-jwt', 'original-route', 'original-destination', ['stop-1', 'stop-2'], identity), false);
    });
  }

  it('does not confirm a result when account lookup is unavailable or forbidden', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const identity = { clientEventId: 'original-command', occurredAt: '2026-10-07T06:00:00.000Z' };
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(
      lookupDriverDeliveryCompletionResult('account-jwt', 'original-route', 'original-destination', ['stop-1'], identity),
      (error: unknown) => error instanceof DriverDeliveryCompletionApiError && error.outcome === 'unknown',
    );
    globalThis.fetch = async () => new Response(JSON.stringify({ data: null, error: { code: 'FORBIDDEN' } }), { status: 403 });
    await assert.rejects(
      lookupDriverDeliveryCompletionResult('account-jwt', 'original-route', 'original-destination', ['stop-1'], identity),
      (error: unknown) => error instanceof DriverDeliveryCompletionApiError && error.status === 403 && error.outcome === 'unknown',
    );
  });

  it('records route completion after the last destination is delivered', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({ data: { eventId: 'event-1' }, error: null }));
    };

    await completeDriverDeliveryRoute('route-token', 'route-1');

    assert.equal(request?.input, 'https://dsv.example.test/driver/events');
    const body = JSON.parse(request?.init?.body as string) as Record<string, unknown>;
    assert.equal(body.eventType, 'ROUTE_COMPLETED');
    assert.equal(body.routePlanId, 'route-1');
    assert.match(body.clientEventId as string, /^route-1:completed:/u);
  });

  it('replays the explicit completion identity unchanged after response loss', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const bodies: unknown[] = [];
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(init?.body as string));
      if (bodies.length === 1) throw new Error('response lost');
      return new Response(JSON.stringify({ data: { eventId: 'event-1' }, error: null }));
    };
    const identity = { clientEventId: 'route-1:completed:stable-command', occurredAt: '2026-10-07T01:00:00.000Z' };
    await assert.rejects(completeDriverDeliveryRoute('route-token', 'route-1', identity), /response lost/u);
    await completeDriverDeliveryRoute('route-token', 'route-1', identity);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[1], { ...identity, eventType: 'ROUTE_COMPLETED', routePlanId: 'route-1' });
  });

  it('acknowledges a stop time change through the existing event endpoint', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({ data: { eventId: 'event-1' }, error: null }));
    };

    await acknowledgeDriverTimeConstraint('route-token', 'route-1', 'stop-1');

    assert.equal(request?.input, 'https://dsv.example.test/driver/events');
    const body = JSON.parse(request?.init?.body as string) as Record<string, unknown>;
    assert.equal(body.eventType, 'TIME_CONSTRAINT_ACKNOWLEDGED');
    assert.equal(body.routePlanId, 'route-1');
    assert.equal(body.deliveryStopId, 'stop-1');
  });

  it('marks a visible driver message read with the route token', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({ data: { messageId: 'message-1' }, error: null }));
    };

    await markDriverOrderMessageRead('route-token', 'message-1');

    assert.equal(
      request?.input,
      'https://dsv.example.test/driver/order-messages/message-1/read',
    );
    assert.equal(request?.init?.method, 'POST');
    assert.equal(
      (request?.init?.headers as Record<string, string>).Authorization,
      'Bearer route-token',
    );
  });
});
