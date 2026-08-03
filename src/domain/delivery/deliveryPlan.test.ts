import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  groupDeliveryOrdersByDestination,
  moveDeliveryOrderToIndex,
  PREVIEW_DELIVERY_ORDERS,
} from './deliveryPlan';

describe('delivery order plan', () => {
  it('keeps a sequence and server-shaped fields on every seller order', () => {
    assert.ok(PREVIEW_DELIVERY_ORDERS.length >= 7);
    assert.equal(
      new Set(PREVIEW_DELIVERY_ORDERS.map(({ id }) => id)).size,
      PREVIEW_DELIVERY_ORDERS.length,
    );
    assert.deepEqual(
      PREVIEW_DELIVERY_ORDERS.map(({ sequence }) => sequence),
      PREVIEW_DELIVERY_ORDERS.map((_, index) => index + 1),
    );

    for (const order of PREVIEW_DELIVERY_ORDERS) {
      assert.ok(order.sellerOrderKey.length > 0);
      assert.ok(order.customerCode.length > 0);
      assert.ok(order.conditionCode.length > 0);
      assert.ok(order.shippedBoxes > 0);
      assert.ok(Number.isFinite(order.coordinate.latitude));
      assert.ok(Number.isFinite(order.coordinate.longitude));
    }
  });

  it('moves one seller order without moving another order at the same destination', () => {
    const source = PREVIEW_DELIVERY_ORDERS;
    const firstOrder = source[0];
    const sameDestinationOrder = source[1];

    assert.ok(firstOrder);
    assert.ok(sameDestinationOrder);
    assert.equal(firstOrder.destinationId, sameDestinationOrder.destinationId);

    const moved = moveDeliveryOrderToIndex(source, firstOrder.id, 3);

    assert.equal(moved[3]?.id, firstOrder.id);
    assert.equal(moved[0]?.id, sameDestinationOrder.id);
    assert.deepEqual(
      moved.map(({ sequence }) => sequence),
      moved.map((_, index) => index + 1),
    );
    assert.equal(source[0], firstOrder);
  });

  it('groups the delivery view by canonical destination while preserving order totals', () => {
    const firstOrder = PREVIEW_DELIVERY_ORDERS[0];
    assert.ok(firstOrder);
    const movedLocationOrder = {
      ...firstOrder,
      coordinate: {
        ...firstOrder.coordinate,
        latitude: firstOrder.coordinate.latitude + 0.0001,
      },
      id: 'same-destination-different-location',
      sellerOrderKey: 'same-destination-different-location',
      sequence: PREVIEW_DELIVERY_ORDERS.length + 1,
    };
    const orders = [...PREVIEW_DELIVERY_ORDERS, movedLocationOrder];

    const groups = groupDeliveryOrdersByDestination(orders);

    assert.equal(groups.length, 3);
    assert.equal(
      groups.reduce((sum, group) => sum + group.orderCount, 0),
      orders.length,
    );
    assert.equal(
      groups.reduce((sum, group) => sum + group.boxCount, 0),
      orders.reduce((sum, order) => sum + order.shippedBoxes, 0),
    );
    assert.deepEqual(groups[0]?.conditionCodes, ['AMBIENT', 'COLD']);
    assert.equal(groups[0]?.orderCount, 3);
  });

  it('clamps a dragged order to the plan boundary', () => {
    const source = PREVIEW_DELIVERY_ORDERS;
    const firstOrder = source[0];
    const lastOrder = source.at(-1);

    assert.ok(firstOrder);
    assert.ok(lastOrder);
    assert.equal(
      moveDeliveryOrderToIndex(source, firstOrder.id, -10)[0]?.id,
      firstOrder.id,
    );
    assert.equal(
      moveDeliveryOrderToIndex(source, lastOrder.id, 99).at(-1)?.id,
      lastOrder.id,
    );
  });
});
