export type DeliveryConditionCode = string;

export type DeliveryOrder = {
  id: string;
  sequence: number;
  sellerOrderKey: string;
  conditionCode: DeliveryConditionCode;
  shippedBoxes: number;
  customerCode: string;
  notes: string | null;
  destinationId: string;
  destinationName: string;
  address: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};

export type DeliveryDestinationGroup = {
  address: string;
  boxCount: number;
  conditionCodes: DeliveryConditionCode[];
  destinationId: string;
  destinationName: string;
  key: string;
  orderCount: number;
  orders: DeliveryOrder[];
};

export type DeliveryDestinationPoint = {
  coordinate: [longitude: number, latitude: number];
  destinationId: string;
  label: string;
  sortOrder: number;
};

export type ServerDeliveryRouteGeometry = {
  coordinates: [longitude: number, latitude: number][];
  type: 'LineString';
};

const DESTINATIONS = {
  ahnyeoncare: {
    destinationId: 'preview-destination-ahnyeoncare',
    destinationName: '안연케어',
    address: '서울 강서구 방화대로50길 8',
    coordinate: { latitude: 37.574466, longitude: 126.814917 },
  },
  daeju: {
    destinationId: 'preview-destination-daeju',
    destinationName: '대주약품',
    address: '서울 중랑구 용마산로 382, 지하1층',
    coordinate: { latitude: 37.586337, longitude: 127.087846 },
  },
  jioyoungGangbuk: {
    destinationId: 'preview-destination-jioyoung-gangbuk',
    destinationName: '지오영강북',
    address: '서울 광진구 천호대로 704',
    coordinate: { latitude: 37.548785, longitude: 127.089721 },
  },
} as const;

// Local preview rows follow the DSV dispatch-import schema. Sequence editing is
// per SellerOrderKey; it does not alter assignment or destination ownership.
export const PREVIEW_DELIVERY_ORDERS: DeliveryOrder[] = [
  {
    id: 'preview-order-2018330223',
    sequence: 1,
    sellerOrderKey: '2018330223',
    conditionCode: 'AMBIENT',
    shippedBoxes: 6,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.jioyoungGangbuk,
  },
  {
    id: 'preview-order-2018330224',
    sequence: 2,
    sellerOrderKey: '2018330224',
    conditionCode: 'COLD',
    shippedBoxes: 3,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.jioyoungGangbuk,
  },
  {
    id: 'preview-order-2018330244',
    sequence: 3,
    sellerOrderKey: '2018330244',
    conditionCode: 'COLD',
    shippedBoxes: 5,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.ahnyeoncare,
  },
  {
    id: 'preview-order-2018330242',
    sequence: 4,
    sellerOrderKey: '2018330242',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.ahnyeoncare,
  },
  {
    id: 'preview-order-2018330266',
    sequence: 5,
    sellerOrderKey: '2018330266',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.daeju,
  },
  {
    id: 'preview-order-2018330265',
    sequence: 6,
    sellerOrderKey: '2018330265',
    conditionCode: 'COLD',
    shippedBoxes: 7,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.daeju,
  },
  {
    id: 'preview-order-2018330264',
    sequence: 7,
    sellerOrderKey: '2018330264',
    conditionCode: 'COLD',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.daeju,
  },
];

export function groupDeliveryOrdersByDestination(
  orders: DeliveryOrder[],
): DeliveryDestinationGroup[] {
  const groups = new Map<string, DeliveryDestinationGroup>();

  for (const order of orders) {
    const key = order.destinationId;
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, {
        address: order.address,
        boxCount: order.shippedBoxes,
        conditionCodes: [order.conditionCode],
        destinationId: order.destinationId,
        destinationName: order.destinationName,
        key,
        orderCount: 1,
        orders: [order],
      });
      continue;
    }

    group.boxCount += order.shippedBoxes;
    group.orderCount += 1;
    group.orders.push(order);
    if (!group.conditionCodes.includes(order.conditionCode)) {
      group.conditionCodes.push(order.conditionCode);
    }
  }

  return [...groups.values()];
}

export function buildDeliveryDestinationPoints(
  orders: DeliveryOrder[],
): DeliveryDestinationPoint[] {
  const destinations = new Map<
    string,
    Omit<DeliveryDestinationPoint, 'label' | 'sortOrder'> & { sequence: number }
  >();

  for (const order of orders) {
    const destination = destinations.get(order.destinationId);
    if (destination === undefined || order.sequence < destination.sequence) {
      destinations.set(order.destinationId, {
        coordinate: [order.coordinate.longitude, order.coordinate.latitude],
        destinationId: order.destinationId,
        sequence: order.sequence,
      });
    }
  }

  return [...destinations.values()]
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.destinationId.localeCompare(right.destinationId),
    )
    .map(({ coordinate, destinationId }, index) => ({
      coordinate,
      destinationId,
      label: String(index + 1),
      sortOrder: index + 1,
    }));
}

export function moveDeliveryOrderToIndex(
  orders: DeliveryOrder[],
  orderId: string,
  requestedIndex: number,
): DeliveryOrder[] {
  const sourceIndex = orders.findIndex(({ id }) => id === orderId);

  if (sourceIndex < 0 || orders.length < 2) {
    return orders;
  }

  const targetIndex = Math.max(
    0,
    Math.min(orders.length - 1, Math.trunc(requestedIndex)),
  );

  if (sourceIndex === targetIndex) {
    return orders;
  }

  const moved = [...orders];
  const [source] = moved.splice(sourceIndex, 1);

  if (source === undefined) {
    return orders;
  }

  moved.splice(targetIndex, 0, source);

  return moved.map((order, index) => ({
    ...order,
    sequence: index + 1,
  }));
}
