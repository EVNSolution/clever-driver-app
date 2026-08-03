import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  acquireDeliveryBundle,
  loadDriverDeliverySpace,
  releaseDeliveryBundle,
} from './dsvDriverDeliverySpace';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver delivery Space API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('loads destination bundles and sends versioned release/acquire commands', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: { input: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input: input.toString(), init });
      return new Response(JSON.stringify({
        data: calls.length === 1
          ? {
              available: [],
              mine: [{
                address: '서울 광진구 천호대로 704',
                boxCount: 9,
                conditionCodes: ['AMBIENT', 'COLD'],
                destinationId: 'destination-a',
                destinationName: '지오영강북',
                orderCount: 2,
              }],
              version: 'grouping-v1',
            }
          : {
              bundle: { destinationId: 'destination-a' },
              routePlanId: 'route-1',
              version: 'grouping-v2',
            },
        error: null,
      }));
    };

    const space = await loadDriverDeliverySpace('route-token');
    await releaseDeliveryBundle('route-token', 'destination-a', space.version);
    await acquireDeliveryBundle('route-token', 'destination-a', 'grouping-v2');

    assert.equal(space.mine[0]?.orderCount, 2);
    assert.equal(calls[0]?.input, 'https://dsv.example.test/driver/delivery-space');
    assert.equal(calls[1]?.input, 'https://dsv.example.test/driver/delivery-space/destination-a/release');
    assert.equal(calls[2]?.input, 'https://dsv.example.test/driver/delivery-space/destination-a/acquire');
    assert.deepEqual(JSON.parse(calls[1]?.init?.body as string), { expectedVersion: 'grouping-v1' });
    assert.equal((calls[2]?.init?.headers as Headers).get('Authorization'), 'Bearer route-token');
  });

  it('does not present a missing server route as an empty Space', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: 'Not Found', message: 'Route GET:/driver/delivery-space not found' }),
      { status: 404 },
    );

    await assert.rejects(
      () => loadDriverDeliverySpace('route-token'),
      (error) =>
        error instanceof Error &&
        error.name === 'DriverDeliverySpaceApiError' &&
        error.message.includes('서버 연결'),
    );
  });
});
