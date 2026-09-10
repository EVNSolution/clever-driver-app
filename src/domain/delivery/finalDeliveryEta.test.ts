import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PREVIEW_DELIVERY_ORDERS, type DeliveryOrder } from './deliveryPlan';
import { buildFinalDeliveryEtaSummary } from './finalDeliveryEta';

const STARTED_AT = '2026-09-09T23:30:00.000Z'; // 08:30 Asia/Seoul
const ARRIVES_AT_1315 = '2026-09-10T04:15:00.000Z';

function routeOrder(
  sequence: number,
  estimatedArrivalAt: string | null,
): DeliveryOrder {
  return {
    ...PREVIEW_DELIVERY_ORDERS[0]!,
    destinationId: `destination-${sequence}`,
    estimatedArrivalAt,
    id: `stop-${sequence}`,
    sequence,
  };
}

function summary(overrides: Partial<Parameters<typeof buildFinalDeliveryEtaSummary>[0]> = {}) {
  return buildFinalDeliveryEtaSummary({
    etaStatus: 'READY',
    executionStatus: 'IN_PROGRESS',
    orders: [routeOrder(1, ARRIVES_AT_1315)],
    pickupCompletedAt: STARTED_AT,
    timezone: 'Asia/Seoul',
    ...overrides,
  });
}

describe('final delivery Rolling ETA summary', () => {
  it('shows the final arrival and elapsed time from the server pickup timestamp', () => {
    assert.deepEqual(summary(), {
      primaryText: '마지막 배송 예상 도착 13:15',
      secondaryText: '배송 시작 후 약 4시간 45분',
    });
  });

  it('uses the latest persisted stop ETA after a Rolling recalculation', () => {
    assert.equal(summary()?.primaryText, '마지막 배송 예상 도착 13:15');
    assert.deepEqual(summary({
      orders: [routeOrder(1, '2026-09-10T04:35:00.000Z')],
    }), {
      primaryText: '마지막 배송 예상 도착 13:35',
      secondaryText: '배송 시작 후 약 5시간 5분',
    });
  });

  it('selects the final stop by route sequence instead of the latest ETA', () => {
    assert.equal(summary({
      orders: [
        routeOrder(30, ARRIVES_AT_1315),
        routeOrder(10, '2026-09-10T06:30:00.000Z'),
        routeOrder(20, '2026-09-10T05:30:00.000Z'),
      ],
    })?.primaryText, '마지막 배송 예상 도착 13:15');
  });

  it('uses the existing ETA state language without guessing a time', () => {
    const noEta = [routeOrder(1, null)];

    assert.deepEqual(summary({ etaStatus: 'PRE_PICKUP', orders: noEta }), {
      primaryText: '마지막 배송 예상 도착 출발 전',
      secondaryText: null,
    });
    assert.deepEqual(summary({ etaStatus: 'FAILED', orders: noEta }), {
      primaryText: '마지막 배송 예상 도착 계산 실패',
      secondaryText: null,
    });
    assert.deepEqual(summary({ orders: noEta }), {
      primaryText: '마지막 배송 예상 도착 계산 중',
      secondaryText: null,
    });
    assert.deepEqual(summary({ orders: [routeOrder(1, 'invalid')] }), {
      primaryText: '마지막 배송 예상 도착 대기 중',
      secondaryText: null,
    });
  });

  it('shows a valid planned ETA before pickup without inventing a duration', () => {
    assert.deepEqual(summary({
      etaStatus: 'PRE_PICKUP',
      pickupCompletedAt: null,
    }), {
      primaryText: '마지막 배송 예상 도착 13:15',
      secondaryText: '배송 시작 전',
    });
  });

  it('formats the persisted instant in the route timezone', () => {
    assert.deepEqual(summary({
      pickupCompletedAt: null,
      timezone: 'America/Toronto',
    }), {
      primaryText: '마지막 배송 예상 도착 00:15',
      secondaryText: null,
    });
  });

  it('does not fall back to the device timezone when the route timezone is invalid', () => {
    assert.deepEqual(summary({ timezone: 'Invalid/Timezone' }), {
      primaryText: '마지막 배송 예상 도착 대기 중',
      secondaryText: null,
    });
  });

  it('hides estimates for completed and cancelled routes', () => {
    assert.equal(summary({ executionStatus: 'COMPLETED' }), null);
    assert.equal(summary({ executionStatus: 'CANCELLED' }), null);
  });
});
