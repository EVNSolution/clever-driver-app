import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  loadDriverDeliveryRoute,
  loadDriverDeliveryRouteChoices,
  loadDriverCompletedRouteHistory,
  updateDriverDeliveryOrder,
  updateDriverDestinationNotes,
} from './dsvDriverRoute';
import { PREVIEW_DELIVERY_ORDERS } from '../domain/delivery/deliveryPlan';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV assigned route API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('loads completed route history through an active route token', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: {
          pageInfo: { endCursor: null, hasNextPage: false },
          routes: [{
            completedAt: '2026-08-26T05:00:00.000Z',
            completedStopCount: 8,
            deliveryDate: '2026-08-26',
            failedStopCount: 0,
            name: '#358',
            routePlanId: 'route-358',
            status: 'completed',
            stopCount: 8,
            timezone: 'Asia/Seoul',
          }],
        },
        error: null,
      }));
    };

    const history = await loadDriverCompletedRouteHistory('active-route-token');

    assert.equal(request?.input, 'https://dsv.example.test/driver/routes?status=completed');
    assert.equal((request?.init?.headers as Headers).get('Authorization'), 'Bearer active-route-token');
    assert.equal(history[0]?.routeName, '#358');
    assert.equal(history[0]?.executionStatus, 'COMPLETED');
    assert.equal(history[0]?.stopCount, 8);
  });

  it('loads the persisted route order including already completed stops', async () => {
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
                companyGuidance: { deliveryDate: '2026-07-30', executionStatus: 'READY', routeName: '#150' },
                driverAccess: { accessToken: 'older-route-token' },
                routeAccess: { routeContext: 'older-route', routePlanId: 'older-route' },
              },
              {
                companyGuidance: { deliveryDate: '2026-07-31', executionStatus: 'IN_PROGRESS', routeName: '#116' },
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
              pickupCompletedAt: '2026-07-31T00:15:00.000Z',
              status: 'READY',
            },
            id: 'route-116',
            name: '#116',
            routeGeometry: serverGeometry,
            routeVersionId: 'route-version-1',
            timezone: 'UTC',
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
                destinationNotes: {
                  lunchEntryStatus: 'AVAILABLE',
                  lunchEntryStatusUpdatedAt: '2026-07-30T23:00:00.000Z',
                  lunchTimeRange: '12:00~13:00',
                  lunchTimeRangeUpdatedAt: '2026-07-30T22:00:00.000Z',
                  memo: '후문으로 입장',
                  memoUpdatedAt: '2026-07-30T21:00:00.000Z',
                  openTime: '09:00',
                  openTimeUpdatedAt: '2026-07-30T19:00:00.000Z',
                  requiredArrivalTime: '10:30',
                  requiredArrivalTimeUpdatedAt: '2026-07-30T20:00:00.000Z',
                },
                customerNote: '10분 전 연락',
                driverMessages: [{
                  body: '후문 경비실에 먼저 연락해 주세요.',
                  createdAt: '2026-07-31T00:30:00.000Z',
                  messageId: 'message-1',
                  readAt: null,
                }],
                estimatedArrivalAt: null,
                orderName: '#0525032088',
                recipientName: '케이팜',
                sellerOrderKey: '0525032088',
                sequence: 1,
                pendingTimeConstraintChange: {
                  pendingChangeId: 'change-1',
                  requestedAt: '2026-07-31T00:40:00.000Z',
                  status: 'PENDING_ACK',
                  timeWindow: {
                    end: '2026-07-31T04:00:00.000Z',
                    start: '2026-07-31T03:00:00.000Z',
                  },
                  type: 'TIME_CONSTRAINT_CHANGE',
                },
                shippedBoxes: 0,
                status: 'PENDING',
                timeWindowEnd: '2026-07-31T03:00:00.000Z',
                timeWindowStart: '2026-07-31T02:00:00.000Z',
              },
              {
                address: {
                  address1: '서울시 송파구 올림픽로 2',
                  address2: null,
                  city: '서울',
                  postalCode: '05540',
                  province: '서울',
                },
                conditionCode: 'AMBIENT',
                coordinates: { latitude: 37.52, longitude: 127.02 },
                deliveryStopId: 'stop-completed',
                destinationId: 'destination-completed',
                orderName: '#0525032087',
                recipientName: '완료 배송지',
                sellerOrderKey: '0525032087',
                sequence: 2,
                shippedBoxes: 1,
                status: 'DELIVERED',
              },
            ],
          },
        },
        error: null,
      }));
    };

    const route = await loadDriverDeliveryRoute('account-token', 'route-116');

    assert.equal(calls[0]?.input, 'https://dsv.example.test/driver/route-access/lookup');
    assert.equal(calls[0]?.init?.headers instanceof Headers, true);
    assert.equal((calls[0]?.init?.headers as Headers).get('Authorization'), 'Bearer account-token');
    assert.equal(calls[1]?.input, 'https://dsv.example.test/driver/assigned-route?routeContext=route-116');
    assert.equal((calls[1]?.init?.headers as Headers).get('Authorization'), 'Bearer selected-route-token');
    assert.equal(route?.deliveryDate, '2026-07-31');
    assert.equal(route?.executionStatus, 'IN_PROGRESS');
    assert.equal(route?.routeContext, 'route-116');
    assert.equal(route?.routePlanId, 'route-116');
    assert.equal(route?.routeVersionId, 'route-version-1');
    assert.equal(route?.availableRoutes.length, 2);
    assert.deepEqual(route?.orders.map(({ id, sequence, status }) => ({
      id,
      sequence,
      status,
    })), [
      { id: 'stop-1', sequence: 1, status: 'PENDING' },
      { id: 'stop-completed', sequence: 2, status: 'DELIVERED' },
    ]);
    assert.equal(route?.orders[0]?.destinationName, '케이팜');
    assert.equal(route?.orders[0]?.destinationId, 'stop-1');
    assert.deepEqual(route?.destinationNotesById['stop-1'], {
      lunchAccess: {
        updatedAt: '2026-07-30T23:00:00.000Z',
        value: 'AVAILABLE',
      },
      lunchTime: {
        updatedAt: '2026-07-30T22:00:00.000Z',
        value: '12:00~13:00',
      },
      memo: {
        updatedAt: '2026-07-30T21:00:00.000Z',
        value: '후문으로 입장',
      },
      openTime: {
        updatedAt: '2026-07-30T19:00:00.000Z',
        value: '09:00',
      },
      requiredArrivalTime: {
        updatedAt: '2026-07-30T20:00:00.000Z',
        value: '10:30',
      },
    });
    assert.equal(route?.orders[0]?.sellerOrderKey, '0525032088');
    assert.equal(route?.orders[0]?.shippedBoxes, 0);
    assert.equal(route?.orders[0]?.conditionCode, 'COLD');
    assert.equal(route?.orders[0]?.estimatedArrivalAt, '2026-07-31T01:30:00.000Z');
    assert.equal(route?.orders[0]?.notes, '10분 전 연락');
    assert.equal(route?.orders[0]?.timeWindowEnd, '2026-07-31T03:00:00.000Z');
    assert.equal(route?.orders[0]?.status, 'PENDING');
    assert.equal(route?.orders[0]?.driverMessages?.[0]?.messageId, 'message-1');
    assert.equal(
      route?.orders[0]?.pendingTimeConstraintChange?.timeWindow?.start,
      '2026-07-31T03:00:00.000Z',
    );
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
    assert.equal(route?.pickupCompletedAt, '2026-07-31T00:15:00.000Z');
    assert.equal(route?.timezone, 'Asia/Seoul');
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
                companyGuidance: { deliveryDate: '2026-07-31', executionStatus: 'IN_PROGRESS', routeName: '#116' },
                driverAccess: { accessToken: 'latest-route-token' },
                routeAccess: { routeContext: 'route-116', routePlanId: 'route-116' },
              },
              {
                companyGuidance: { deliveryDate: '2026-07-30', executionStatus: 'READY', routeName: '#2' },
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
    assert.equal(route?.nextDeliveryStopId, null);
  });

  it('exposes server route choices for date selection', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';

    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        status: 'ROUTES_FOUND',
        routes: [
          {
            companyGuidance: { deliveryDate: '2026-07-30', executionStatus: 'READY', routeName: '#2' },
            driverAccess: { accessToken: 'older-token' },
            routeAccess: { routeContext: 'older-context', routePlanId: 'older-id' },
          },
          {
            companyGuidance: { deliveryDate: '2026-07-31', executionStatus: 'IN_PROGRESS', routeName: '#116' },
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
    assert.equal(routeChoices[0]?.executionStatus, 'IN_PROGRESS');
  });

  it('preserves an empty vehicle-backed route so shared orders remain reachable', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let call = 0;
    globalThis.fetch = async () => {
      call += 1;
      return new Response(JSON.stringify(call === 1 ? {
        data: {
          status: 'ROUTES_FOUND',
          routes: [{
            companyGuidance: { deliveryDate: '2026-08-07', executionStatus: 'READY', routeName: '#205' },
            driverAccess: { accessToken: 'empty-route-token' },
            routeAccess: { routeContext: 'route-205', routePlanId: 'route-205' },
          }],
        },
        error: null,
      } : {
        data: { status: 'NO_ASSIGNED_ROUTE' },
        error: null,
      }));
    };

    const route = await loadDriverDeliveryRoute('account-token', 'route-205');

    assert.equal(route?.deliveryDate, '2026-08-07');
    assert.equal(route?.routeName, '#205');
    assert.equal(route?.routePlanId, 'route-205');
    assert.equal(route?.routeAccessToken, 'empty-route-token');
    assert.deepEqual(route?.orders, []);
    assert.equal(route?.availableRoutes.length, 1);
  });

  it('returns no choices when the linked account has no active route', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: { status: 'ROUTES_FOUND', routes: [] },
      error: null,
    }));

    assert.deepEqual(await loadDriverDeliveryRouteChoices('account-token'), []);
  });

  it('does not silently replace an unavailable explicit route selection', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        status: 'ROUTES_FOUND',
        routes: [{
          companyGuidance: { deliveryDate: '2026-08-07', executionStatus: 'READY', routeName: '#205' },
          driverAccess: { accessToken: 'route-token' },
          routeAccess: { routeContext: 'route-205', routePlanId: 'route-205' },
        }],
      },
      error: null,
    }));

    await assert.rejects(
      loadDriverDeliveryRoute('account-token', 'missing-route'),
      (error: unknown) => (
        error instanceof Error &&
        error.name === 'DriverRouteApiError' &&
        error.message === '선택한 배송 경로를 확인할 수 없습니다.'
      ),
    );
  });

  it('patches only changed destination note fields and uses server timestamps', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: {
          destinationId: 'destination-1',
          notes: {
            lunchEntryStatus: null,
            lunchEntryStatusUpdatedAt: '2026-08-18T04:00:00.000Z',
            lunchTimeRange: '12:00~13:00',
            lunchTimeRangeUpdatedAt: '2026-08-17T03:00:00.000Z',
            memo: null,
            memoUpdatedAt: '2026-08-18T04:00:00.000Z',
            openTime: '09:00',
            openTimeUpdatedAt: '2026-08-18T03:00:00.000Z',
            requiredArrivalTime: '10:30',
            requiredArrivalTimeUpdatedAt: '2026-08-17T05:00:00.000Z',
          },
        },
        error: null,
      }));
    };

    const notes = await updateDriverDestinationNotes(
      'route-token',
      'destination-1',
      {
        lunchAccess: { updatedAt: null, value: 'AVAILABLE' },
        lunchTime: { updatedAt: '2026-08-17T03:00:00.000Z', value: '12:00~13:00' },
        memo: { updatedAt: null, value: '기존 메모' },
        openTime: { updatedAt: null, value: '' },
        requiredArrivalTime: { updatedAt: '2026-08-17T05:00:00.000Z', value: '10:30' },
      },
      {
        lunchAccess: 'UNKNOWN',
        lunchTime: '12:00~13:00',
        memo: '',
        openTime: '09:00',
        requiredArrivalTime: '10:30',
      },
    );

    assert.equal(request?.input, 'https://dsv.example.test/driver/destinations/destination-1/notes');
    assert.equal(request?.init?.method, 'PATCH');
    assert.equal((request?.init?.headers as Headers).get('Authorization'), 'Bearer route-token');
    assert.deepEqual(JSON.parse(request?.init?.body as string), {
      lunchEntryStatus: null,
      memo: null,
      openTime: '09:00',
    });
    assert.deepEqual(notes.memo, {
      updatedAt: '2026-08-18T04:00:00.000Z',
      value: '',
    });
    assert.deepEqual(notes.lunchAccess, {
      updatedAt: '2026-08-18T04:00:00.000Z',
      value: 'UNKNOWN',
    });
  });

  it('saves the complete stop order with one command id and adopts the authoritative response', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const requests: { input: string; init?: RequestInit }[] = [];
    const orders = PREVIEW_DELIVERY_ORDERS.slice(0, 2);
    globalThis.fetch = async (input, init) => {
      requests.push({ input: input.toString(), init });
      if (requests.length === 1) throw new TypeError('response lost');
      return new Response(JSON.stringify({
        data: {
          routePlanId: 'route-116',
          routeVersionId: 'route-version-2',
          stops: [
            { deliveryStopId: orders[1]!.id, sequence: 1 },
            { deliveryStopId: orders[0]!.id, sequence: 2 },
          ],
        },
        error: null,
      }));
    };

    const saved = await updateDriverDeliveryOrder(
      'route-token',
      'route-116',
      'route-version-1',
      orders,
    );

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.input, 'https://dsv.example.test/driver/routes/route-116/order');
    assert.equal(requests[0]?.init?.method, 'PATCH');
    assert.equal((requests[0]?.init?.headers as Headers).get('Authorization'), 'Bearer route-token');
    const firstBody = JSON.parse(requests[0]?.init?.body as string) as Record<string, unknown>;
    const retryBody = JSON.parse(requests[1]?.init?.body as string) as Record<string, unknown>;
    assert.equal(typeof firstBody.commandId, 'string');
    assert.match(firstBody.commandId as string, /^[A-Za-z0-9._:-]{1,120}$/u);
    assert.deepEqual(firstBody, retryBody);
    assert.deepEqual(firstBody, {
      commandId: firstBody.commandId,
      expectedVersion: 'route-version-1',
      orderedStopIds: orders.map(({ id }) => id),
    });
    assert.equal(saved.routeVersionId, 'route-version-2');
    assert.deepEqual(saved.orders.map(({ id, sequence }) => ({ id, sequence })), [
      { id: orders[1]!.id, sequence: 1 },
      { id: orders[0]!.id, sequence: 2 },
    ]);
    assert.equal(saved.orders.every(({ estimatedArrivalAt }) => (
      estimatedArrivalAt === null
    )), true);
  });

  it('does not apply a stale manual order after the route version changes', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: null,
      error: { code: 'VERSION_CONFLICT', message: 'VERSION_CONFLICT' },
    }), { status: 409 });

    await assert.rejects(
      updateDriverDeliveryOrder(
        'route-token',
        'route-116',
        'stale-route-version',
        PREVIEW_DELIVERY_ORDERS.slice(0, 2),
      ),
      (error: unknown) => error instanceof Error
        && error.name === 'DriverRouteApiError'
        && error.message === '배송 경로가 변경됐습니다. 최신 순서를 확인한 뒤 다시 시도해 주세요.',
    );
  });

  it('rejects an incomplete authoritative stop order response', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const orders = PREVIEW_DELIVERY_ORDERS.slice(0, 2);
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: {
        routePlanId: 'route-116',
        routeVersionId: 'route-version-2',
        stops: [{ deliveryStopId: orders[0]!.id, sequence: 1 }],
      },
      error: null,
    }));

    await assert.rejects(
      updateDriverDeliveryOrder(
        'route-token',
        'route-116',
        'route-version-1',
        orders,
      ),
      (error: unknown) => error instanceof Error
        && error.name === 'DriverRouteApiError'
        && error.message === '저장된 배송 순서를 확인할 수 없습니다.',
    );
  });

  it('reports an actionable error after the idempotent network retry fails', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      throw new TypeError('Network request failed');
    };

    await assert.rejects(
      updateDriverDeliveryOrder(
        'route-token',
        'route-116',
        'route-version-1',
        PREVIEW_DELIVERY_ORDERS.slice(0, 2),
      ),
      (error: unknown) => error instanceof Error
        && error.name === 'DriverRouteApiError'
        && error.message === '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    );
    assert.equal(requestCount, 2);
  });
});
