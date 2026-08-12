import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  acknowledgeDriverTimeConstraint,
  completeDriverDeliveryDestination,
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
        data: { eventId: 'event-1' },
        error: null,
      }));
    };

    await completeDriverDeliveryDestination(
      'route-token',
      'route-1',
      'destination-1',
      ['stop-1', 'stop-2'],
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
