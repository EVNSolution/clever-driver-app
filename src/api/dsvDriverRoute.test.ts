import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  loadDriverDeliveryRoute,
  loadDriverDeliveryRouteChoices,
} from './dsvDriverRoute';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV assigned route API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('uses the account token to select a route and the scoped token to load actual stops', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: { input: string; init?: RequestInit }[] = [];
    const serverGeometry = {
      type: 'LineString',
      coordinates: [
        [127.01, 37.51],
        [127.02, 37.52],
      ],
    } as const;

    globalThis.fetch = async (input, init) => {
      calls.push({ input: input.toString(), init });

      if (calls.length === 1) {
        return new Response(JSON.stringify({
          data: {
            status: 'ROUTES_FOUND',
            routes: [
              {
                companyGuidance: { deliveryDate: '2026-07-30', routeName: '#150' },
                driverAccess: { accessToken: 'older-route-token' },
                routeAccess: { routeContext: 'older-route', routePlanId: 'older-route' },
              },
              {
                companyGuidance: { deliveryDate: '2026-07-31', routeName: '#116' },
                driverAccess: { accessToken: 'selected-route-token' },
                routeAccess: { routeContext: 'route-116', routePlanId: 'route-116' },
              },
            ],
          },
          error: null,
        }));
      }

      return new Response(JSON.stringify({
        data: {
          status: 'ASSIGNED_ROUTE',
          route: {
            deliveryDate: '2026-07-31',
            depot: { latitude: 35.9676, longitude: 126.7369 },
            etaSnapshot: {
              nextStopEta: {
                deliveryStopId: 'stop-1',
                estimatedArrivalAt: '2026-07-31T01:30:00.000Z',
              },
              status: 'READY',
            },
            id: 'route-116',
            name: '#116',
            routeGeometry: serverGeometry,
            stops: [
              {
                address: {
                  address1: '서울시 강남구 테헤란로 1 2층 (역삼동, 빌딩)',
                  address2: '2층 (역삼동,빌딩)',
                  city: '서울',
                  postalCode: '06134',
                  province: '서울',
                },
                conditionCode: 'COLD',
                coordinates: { latitude: 37.51, longitude: 127.01 },
                deliveryStopId: 'stop-1',
                destinationId: null,
                customerNote: '10분 전 연락',
                estimatedArrivalAt: null,
                orderName: '#0525032088',
                recipientName: '케이팜',
                sellerOrderKey: '0525032088',
                sequence: 1,
                shippedBoxes: 4,
                status: 'PENDING',
                timeWindowEnd: '2026-07-31T03:00:00.000Z',
                timeWindowStart: '2026-07-31T02:00:00.000Z',
              },
            ],
          },
        },
        error: null,
      }));
    };

    const route = await loadDriverDeliveryRoute('account-token');

    assert.equal(calls[0]?.input, 'https://dsv.example.test/driver/route-access/lookup');
    assert.equal(calls[0]?.init?.headers instanceof Headers, true);
    assert.equal((calls[0]?.init?.headers as Headers).get('Authorization'), 'Bearer account-token');
    assert.equal(calls[1]?.input, 'https://dsv.example.test/driver/assigned-route?routeContext=route-116');
    assert.equal((calls[1]?.init?.headers as Headers).get('Authorization'), 'Bearer selected-route-token');
    assert.equal(route?.deliveryDate, '2026-07-31');
    assert.equal(route?.routePlanId, 'route-116');
    assert.equal(route?.availableRoutes.length, 2);
    assert.equal(route?.orders[0]?.destinationName, '케이팜');
    assert.equal(route?.orders[0]?.destinationId, 'stop-1');
    assert.equal(route?.orders[0]?.sellerOrderKey, '0525032088');
    assert.equal(route?.orders[0]?.shippedBoxes, 4);
    assert.equal(route?.orders[0]?.conditionCode, 'COLD');
    assert.equal(route?.orders[0]?.estimatedArrivalAt, '2026-07-31T01:30:00.000Z');
    assert.equal(route?.orders[0]?.notes, '10분 전 연락');
    assert.equal(route?.orders[0]?.timeWindowEnd, '2026-07-31T03:00:00.000Z');
    assert.equal(route?.orders[0]?.status, 'PENDING');
    assert.equal(
      route?.orders[0]?.address,
      '서울시 강남구 테헤란로 1 2층 (역삼동, 빌딩)',
    );
    assert.deepEqual(route?.serverRouteGeometry, serverGeometry);
    assert.deepEqual(route?.depotCoordinate, {
      latitude: 35.9676,
      longitude: 126.7369,
    });
    assert.equal(route?.nextDeliveryStopId, 'stop-1');
  });

  it('loads the route selected by date instead of always using the latest route', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: { input: string; init?: RequestInit }[] = [];

    globalThis.fetch = async (input, init) => {
      calls.push({ input: input.toString(), init });

      if (calls.length === 1) {
        return new Response(JSON.stringify({
          data: {
            status: 'ROUTES_FOUND',
            routes: [
              {
                companyGuidance: { deliveryDate: '2026-07-31', routeName: '#116' },
                driverAccess: { accessToken: 'latest-route-token' },
                routeAccess: { routeContext: 'route-116', routePlanId: 'route-116' },
              },
              {
                companyGuidance: { deliveryDate: '2026-07-30', routeName: '#2' },
                driverAccess: { accessToken: 'selected-route-token' },
                routeAccess: { routeContext: 'route-2', routePlanId: 'route-2' },
              },
            ],
          },
          error: null,
        }));
      }

      return new Response(JSON.stringify({
        data: {
          status: 'ASSIGNED_ROUTE',
          route: {
            deliveryDate: '2026-07-30',
            id: 'route-2',
            name: '#2',
            routeGeometry: null,
            stops: [
              {
                address: {
                  address1: '서울시 강남구 테헤란로 1',
                  address2: null,
                  city: '서울',
                  postalCode: null,
                  province: '서울',
                },
                conditionCode: 'AMBIENT',
                coordinates: { latitude: 37.51, longitude: 127.01 },
                deliveryStopId: 'stop-2',
                destinationId: 'destination-2',
                orderName: '#0525032000',
                recipientName: '양우진 배송처',
                sellerOrderKey: '0525032000',
                sequence: 1,
                shippedBoxes: 1,
                status: 'PENDING',
              },
            ],
          },
        },
        error: null,
      }));
    };

    const route = await loadDriverDeliveryRoute('account-token', 'route-2');

    assert.equal(calls[1]?.input, 'https://dsv.example.test/driver/assigned-route?routeContext=route-2');
    assert.equal((calls[1]?.init?.headers as Headers).get('Authorization'), 'Bearer selected-route-token');
    assert.equal(route?.deliveryDate, '2026-07-30');
    assert.equal(route?.routePlanId, 'route-2');
  });

  it('exposes server route choices for date selection', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';

    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        status: 'ROUTES_FOUND',
        routes: [
          {
            companyGuidance: { deliveryDate: '2026-07-30', routeName: '#2' },
            driverAccess: { accessToken: 'older-token' },
            routeAccess: { routeContext: 'older-context', routePlanId: 'older-id' },
          },
          {
            companyGuidance: { deliveryDate: '2026-07-31', routeName: '#116' },
            driverAccess: { accessToken: 'newer-token' },
            routeAccess: { routeContext: 'newer-context', routePlanId: 'newer-id' },
          },
        ],
      },
      error: null,
    }));

    const routeChoices = await loadDriverDeliveryRouteChoices('account-token');

    assert.deepEqual(routeChoices.map(({ deliveryDate }) => deliveryDate), [
      '2026-07-31',
      '2026-07-30',
    ]);
    assert.equal(routeChoices[0]?.routeContext, 'newer-context');
    assert.equal(routeChoices[0]?.routeName, '#116');
  });

  it('returns null when the linked account has no active route', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: { status: 'ROUTES_FOUND', routes: [] },
      error: null,
    }));

    assert.equal(await loadDriverDeliveryRoute('account-token'), null);
  });
});
