import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCurrentDeliverySummary,
  buildDeliveryDestinationPoints,
  buildDeliveryRouteVisualState,
  completesDeliveryRoute,
  groupDeliveryOrdersByDestination,
  moveDeliveryOrderToIndex,
  PREVIEW_DELIVERY_DATE,
  PREVIEW_DELIVERY_ORDERS,
  resolveDeliveryDestinationProgressState,
} from './deliveryPlan';

describe('delivery order plan', () => {
  it('keeps a sequence and server-shaped fields on every seller order', () => {
    assert.equal(PREVIEW_DELIVERY_DATE, '2026-08-26');
    assert.equal(PREVIEW_DELIVERY_ORDERS.length, 14);
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

    const destinationCounts = groupDeliveryOrdersByDestination(
      PREVIEW_DELIVERY_ORDERS,
    ).map(({ orderCount }) => orderCount);
    assert.equal(destinationCounts.length, 8);
    assert.ok(destinationCounts.every((orderCount) => orderCount <= 2));
  });

  it('moves one seller order without moving another order at the same destination', () => {
    const source = PREVIEW_DELIVERY_ORDERS;
    const firstOrder = source[0];
    const sameDestinationOrder = source.find(
      (order) => order.id !== firstOrder?.id
        && order.destinationId === firstOrder?.destinationId,
    );

    assert.ok(firstOrder);
    assert.ok(sameDestinationOrder);
    assert.equal(firstOrder.destinationId, sameDestinationOrder.destinationId);

    const moved = moveDeliveryOrderToIndex(source, firstOrder.id, 3);

    assert.equal(moved[3]?.id, firstOrder.id);
    assert.equal(
      moved.find(({ id }) => id === sameDestinationOrder.id)?.destinationId,
      sameDestinationOrder.destinationId,
    );
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

    assert.equal(groups.length, 8);
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
    assert.deepEqual(groups[0]?.orders.map(({ id }) => id), [
      firstOrder.id,
      PREVIEW_DELIVERY_ORDERS.find(
        (order) => order.id !== firstOrder.id
          && order.destinationId === firstOrder.destinationId,
      )?.id,
      movedLocationOrder.id,
    ]);
  });

  it('keeps a consolidated zero-box order in its destination group', () => {
    const firstOrder = PREVIEW_DELIVERY_ORDERS[0];
    assert.ok(firstOrder);
    const zeroBoxOrder = { ...firstOrder, shippedBoxes: 0 };

    const [group] = groupDeliveryOrdersByDestination([zeroBoxOrder]);

    assert.equal(group?.orderCount, 1);
    assert.equal(group?.boxCount, 0);
  });

  it('builds one numbered map point per canonical destination', () => {
    const firstOrder = PREVIEW_DELIVERY_ORDERS[0];
    assert.ok(firstOrder);
    const duplicateDestinationOrder = {
      ...firstOrder,
      coordinate: {
        latitude: firstOrder.coordinate.latitude + 0.0001,
        longitude: firstOrder.coordinate.longitude + 0.0001,
      },
      id: 'duplicate-destination-order',
      sequence: 99,
    };

    const points = buildDeliveryDestinationPoints([
      ...PREVIEW_DELIVERY_ORDERS,
      duplicateDestinationOrder,
    ]);

    assert.equal(points.length, 8);
    assert.deepEqual(
      points.map(({ label }) => label),
      ['1', '2', '3', '4', '5', '6', '7', '8'],
    );
    assert.equal(points[0]?.destinationId, firstOrder.destinationId);
    assert.deepEqual(points[0]?.coordinate, [
      firstOrder.coordinate.longitude,
      firstOrder.coordinate.latitude,
    ]);
  });

  it('colors only server route slices and destination markers by delivery progress', () => {
    const destinationOrders = groupDeliveryOrdersByDestination(
      PREVIEW_DELIVERY_ORDERS,
    ).slice(0, 3).flatMap(({ orders }) => orders);
    const orders = destinationOrders.map((order) => ({
      ...order,
      status: order.destinationId === destinationOrders[0]?.destinationId
        ? 'DELIVERED'
        : 'READY',
    }));
    const [firstPoint, secondPoint, thirdPoint] = buildDeliveryDestinationPoints(orders);
    assert.ok(firstPoint);
    assert.ok(secondPoint);
    assert.ok(thirdPoint);
    const routeGeometry = {
      coordinates: [
        [126.6, 37.45],
        firstPoint.coordinate,
        [126.68, 37.52],
        secondPoint.coordinate,
        [126.72, 37.5],
        thirdPoint.coordinate,
      ] as [number, number][],
      type: 'LineString' as const,
    };
    const currentOrder = orders.find(
      ({ destinationId }) => destinationId === thirdPoint.destinationId,
    );
    assert.ok(currentOrder);

    const visualState = buildDeliveryRouteVisualState(
      orders,
      routeGeometry,
      currentOrder.id,
    );

    assert.deepEqual(
      visualState.markers.map(({ markerState }) => markerState),
      ['completed', 'completed', 'current'],
    );
    assert.deepEqual(visualState.completedGeometry?.coordinates, [
      routeGeometry.coordinates[0],
      routeGeometry.coordinates[1],
      routeGeometry.coordinates[2],
      routeGeometry.coordinates[3],
    ]);
    assert.deepEqual(visualState.currentGeometry?.coordinates, [
      routeGeometry.coordinates[3],
      routeGeometry.coordinates[4],
      routeGeometry.coordinates[5],
    ]);
    assert.equal(visualState.upcomingGeometry, routeGeometry);
  });

  it('classifies grouped delivery rows from completed orders and the active stop', () => {
    const orders = groupDeliveryOrdersByDestination(PREVIEW_DELIVERY_ORDERS)
      .slice(0, 3)
      .flatMap(({ orders }, groupIndex) => orders.map((order) => ({
        ...order,
        status: groupIndex === 0 ? 'DELIVERED' : 'READY',
      })));
    const groups = groupDeliveryOrdersByDestination(orders);
    const activeOrder = groups[1]?.orders[0];
    assert.ok(activeOrder);

    assert.deepEqual(
      groups.map((group) =>
        resolveDeliveryDestinationProgressState(group, activeOrder.id),
      ),
      ['completed', 'current', 'upcoming'],
    );
  });

  it('completes a route only when the submitted destination closes every remaining stop', () => {
    const [firstOrder, secondOrder, thirdOrder] = PREVIEW_DELIVERY_ORDERS;
    assert.ok(firstOrder);
    assert.ok(secondOrder);
    assert.ok(thirdOrder);
    const orders = [
      { ...firstOrder, status: 'DELIVERED' },
      { ...secondOrder, status: 'READY' },
      { ...thirdOrder, status: 'CANCELLED' },
    ];

    assert.equal(completesDeliveryRoute(orders, [secondOrder.id]), true);
    assert.equal(completesDeliveryRoute(orders, []), false);
    assert.equal(completesDeliveryRoute([], []), false);
  });

  it('summarizes the server-selected next stop destination', () => {
    const firstOrder = PREVIEW_DELIVERY_ORDERS[0];
    const secondOrder = PREVIEW_DELIVERY_ORDERS.find(
      (order) => order.id !== firstOrder?.id
        && order.destinationId === firstOrder?.destinationId,
    );
    assert.ok(firstOrder);
    assert.ok(secondOrder);
    const thirdOrder = {
      ...secondOrder,
      id: 'preview-order-2018330225',
      sellerOrderKey: '2018330225',
      sequence: 3,
      shippedBoxes: 1,
    };

    const summary = buildCurrentDeliverySummary(
      [
        {
          ...firstOrder,
          estimatedArrivalAt: '2026-08-03T01:30:00.000Z',
          notes: '도착 전 연락',
          timeWindowEnd: '2026-08-03T03:00:00.000Z',
          timeWindowStart: '2026-08-03T02:00:00.000Z',
        },
        secondOrder,
        thirdOrder,
      ],
      firstOrder.id,
    );

    assert.deepEqual(summary, {
      address: firstOrder.address,
      boxCount: firstOrder.shippedBoxes + secondOrder.shippedBoxes + thirdOrder.shippedBoxes,
      orderBoxes: [
        {
          boxCount: firstOrder.shippedBoxes,
          conditionCode: firstOrder.conditionCode,
          orderId: firstOrder.id,
        },
        {
          boxCount: secondOrder.shippedBoxes,
          conditionCode: secondOrder.conditionCode,
          orderId: secondOrder.id,
        },
        {
          boxCount: thirdOrder.shippedBoxes,
          conditionCode: thirdOrder.conditionCode,
          orderId: thirdOrder.id,
        },
      ],
      conditionCodes: [firstOrder.conditionCode, secondOrder.conditionCode],
      destinationId: firstOrder.destinationId,
      destinationName: firstOrder.destinationName,
      destinationSequence: 1,
      estimatedArrivalAt: '2026-08-03T01:30:00.000Z',
      notes: ['도착 전 연락'],
      orderCount: 3,
      deliveryStopId: firstOrder.id,
      deliveryStopIds: [firstOrder.id, secondOrder.id, thirdOrder.id],
      timeWindowEnd: '2026-08-03T03:00:00.000Z',
      timeWindowOrderCount: 1,
      timeWindowStart: '2026-08-03T02:00:00.000Z',
    });
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
