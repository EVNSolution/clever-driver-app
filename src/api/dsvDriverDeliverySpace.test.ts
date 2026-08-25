import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  acquireDeliveryBundle,
  acceptDeliveryBundleHandoff,
  cancelDeliveryBundleHandoff,
  loadDriverDeliverySpace,
  releaseDeliveryBundle,
  rejectDeliveryBundleHandoff,
  requestDeliveryBundleHandoff,
} from './dsvDriverDeliverySpace';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver delivery Space API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('loads destination bundles and sends versioned release/acquire/handoff commands', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: { input: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input: input.toString(), init });
      return new Response(JSON.stringify({
        data: calls.length === 1
          ? {
              available: [{
                address: '인천 부평구 평천로115번길 29',
                boxCount: 1,
                conditionCodes: ['AMBIENT'],
                destinationId: 'destination-public',
                destinationName: '(주)동진팜',
                orderCount: 1,
              }],
              incomingHandoffs: [{
                bundle: {
                  address: '서울 광진구 천호대로 704',
                  boxCount: 9,
                  conditionCodes: ['AMBIENT'],
                  destinationId: 'destination-b',
                  destinationName: '지오영동부',
                  orderCount: 1,
                },
                expiresAt: '2026-08-26T09:10:00.000Z',
                requestId: 'handoff-in',
                senderDriverName: '양우진',
                status: 'PROPOSED',
              }],
              mine: [{
                address: '인천 서구 북항단지로 91 (원창동) 6층',
                boxCount: 20,
                conditionCodes: ['AMBIENT', 'COLD'],
                destinationId: 'destination-a',
                destinationName: '인천신허브',
                orderCount: 2,
              }],
              outgoingHandoffs: [{
                bundle: {
                  address: '인천 서구 북항단지로 91 (원창동) 6층',
                  boxCount: 20,
                  conditionCodes: ['AMBIENT', 'COLD'],
                  destinationId: 'destination-a',
                  destinationName: '인천신허브',
                  orderCount: 2,
                },
                expiresAt: '2026-08-26T09:12:00.000Z',
                requestId: 'handoff-out',
                status: 'PROPOSED',
                targetDriverName: '양우진',
              }],
              recipients: [{ driverId: 'driver-2', driverName: '양우진' }],
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
    await acquireDeliveryBundle('route-token', 'destination-public', 'grouping-v2');
    await requestDeliveryBundleHandoff('route-token', 'destination-a', 'grouping-v2', 'driver-2');
    await acceptDeliveryBundleHandoff('route-token', 'handoff-in');
    await rejectDeliveryBundleHandoff('route-token', 'handoff-in');
    await cancelDeliveryBundleHandoff('route-token', 'handoff-out');

    assert.equal(space.mine[0]?.orderCount, 2);
    assert.equal(space.available[0]?.destinationName, '(주)동진팜');
    assert.equal(space.incomingHandoffs[0]?.senderDriverName, '양우진');
    assert.equal(space.outgoingHandoffs[0]?.targetDriverName, '양우진');
    assert.equal(calls[0]?.input, 'https://dsv.example.test/driver/delivery-space');
    assert.equal(calls[1]?.input, 'https://dsv.example.test/driver/delivery-space/destination-a/release');
    assert.equal(calls[2]?.input, 'https://dsv.example.test/driver/delivery-space/destination-public/acquire');
    assert.equal(calls[3]?.input, 'https://dsv.example.test/driver/delivery-space/destination-a/handoff-requests');
    assert.equal(calls[4]?.input, 'https://dsv.example.test/driver/delivery-space/handoff-requests/handoff-in/accept');
    assert.equal(calls[5]?.input, 'https://dsv.example.test/driver/delivery-space/handoff-requests/handoff-in/reject');
    assert.equal(calls[6]?.input, 'https://dsv.example.test/driver/delivery-space/handoff-requests/handoff-out/cancel');
    assert.deepEqual(JSON.parse(calls[1]?.init?.body as string), { expectedVersion: 'grouping-v1' });
    assert.deepEqual(JSON.parse(calls[3]?.init?.body as string), {
      expectedVersion: 'grouping-v2',
      targetDriverId: 'driver-2',
    });
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

  it('keeps release and pickup usable during a server rollback without recipient data', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: { available: [], mine: [], version: 'grouping-v1' },
      error: null,
    }));

    const space = await loadDriverDeliverySpace('route-token');

    assert.deepEqual(space.recipients, []);
    assert.deepEqual(space.incomingHandoffs, []);
    assert.deepEqual(space.outgoingHandoffs, []);
  });
});
