import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { completeDriverDeliveryStop } from './dsvDriverEvents';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver events API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('records delivery completion for the server-selected stop', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: { eventId: 'event-1' },
        error: null,
      }));
    };

    await completeDriverDeliveryStop('route-token', 'route-1', 'stop-1');

    assert.equal(request?.input, 'https://dsv.example.test/driver/events');
    assert.equal(request?.init?.method, 'POST');
    assert.equal(
      (request?.init?.headers as Record<string, string>).Authorization,
      'Bearer route-token',
    );
    assert.match(request?.init?.body as string, /"eventType":"STOP_DELIVERED"/u);
    assert.match(request?.init?.body as string, /"deliveryStopId":"stop-1"/u);
  });
});
