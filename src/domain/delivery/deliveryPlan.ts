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
  estimatedArrivalAt?: string | null;
  timeWindowEnd?: string | null;
  timeWindowStart?: string | null;
  status?: string;
  address: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  driverMessages?: {
    body: string;
    createdAt: string;
    messageId: string;
    readAt: string | null;
  }[];
  pendingTimeConstraintChange?: {
    pendingChangeId: string;
    requestedAt: string;
    timeWindow: { end: string; start: string } | null;
  } | null;
};

export type DeliveryCoordinate = {
  latitude: number;
  longitude: number;
};

export type CurrentDeliverySummary = {
  address: string;
  boxCount: number;
  orderBoxes: {
    boxCount: number;
    conditionCode: DeliveryConditionCode;
    orderId: string;
  }[];
  deliveryStopId: string;
  deliveryStopIds: string[];
  destinationId: string;
  destinationName: string;
  destinationSequence: number;
  estimatedArrivalAt: string | null;
  conditionCodes: DeliveryConditionCode[];
  notes: string[];
  orderCount: number;
  timeWindowEnd: string | null;
  timeWindowOrderCount: number;
  timeWindowStart: string | null;
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

export type DeliveryRouteMarkerState = 'completed' | 'current' | 'upcoming';

export type DeliveryRouteVisualState = {
  completedGeometry: ServerDeliveryRouteGeometry | null;
  currentGeometry: ServerDeliveryRouteGeometry | null;
  markers: (DeliveryDestinationPoint & {
    markerState: DeliveryRouteMarkerState;
  })[];
  upcomingGeometry: ServerDeliveryRouteGeometry | null;
};

export type ServerDeliveryRouteGeometry = {
  coordinates: [longitude: number, latitude: number][];
  type: 'LineString';
};

const DESTINATIONS = {
  gangseon: {
    destinationId: 'preview-destination-gangseon',
    destinationName: '강선팜',
    address: '서울 마포구 모래내로7길 12, 5층(성산동, MEK빌딩)',
    coordinate: { latitude: 37.5684, longitude: 126.9086 },
  },
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
  dongjin: {
    destinationId: 'preview-destination-dongjin',
    destinationName: '(주)동진팜',
    address: '인천 부평구 평천로115번길 29',
    coordinate: { latitude: 37.5179, longitude: 126.7053 },
  },
  incheonPharm: {
    destinationId: 'preview-destination-incheon-pharm',
    destinationName: '인천약품',
    address: '인천 부평구 일신동 79-7',
    coordinate: { latitude: 37.4821, longitude: 126.7408 },
  },
  incheonShinhub: {
    destinationId: 'preview-destination-incheon-shinhub',
    destinationName: '인천신허브',
    address: '인천 서구 북항단지로 91 (원창동) 6층',
    coordinate: { latitude: 37.5273, longitude: 126.6469 },
  },
  seojun: {
    destinationId: 'preview-destination-seojun',
    destinationName: '주식회사서준약품',
    address: '서울 마포구 희우정로5길 28, 2층(합정동, 세라빌딩)',
    coordinate: { latitude: 37.5486, longitude: 126.9152 },
  },
} as const;

// Local preview rows follow the DSV dispatch-import schema. Sequence editing is
// per SellerOrderKey; it does not alter assignment or destination ownership.
export const PREVIEW_DELIVERY_DATE = '2026-08-26';
export const PREVIEW_DELIVERY_ORDERS: DeliveryOrder[] = [
  {
    id: 'preview-order-2018330231',
    sequence: 1,
    sellerOrderKey: '2018330231',
    conditionCode: 'AMBIENT',
    shippedBoxes: 14,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.incheonShinhub,
  },
  {
    id: 'preview-order-2018330254',
    sequence: 2,
    sellerOrderKey: '2018330254',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.dongjin,
  },
  {
    id: 'preview-order-8008307916',
    sequence: 3,
    sellerOrderKey: '8008307916',
    conditionCode: 'AMBIENT',
    shippedBoxes: 2,
    customerCode: 'teva',
    notes: null,
    ...DESTINATIONS.incheonPharm,
  },
  {
    id: 'preview-order-2018330244',
    sequence: 4,
    sellerOrderKey: '2018330244',
    conditionCode: 'COLD',
    shippedBoxes: 5,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.ahnyeoncare,
  },
  {
    id: 'preview-order-2018330218',
    sequence: 5,
    sellerOrderKey: '2018330218',
    conditionCode: 'COLD',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.seojun,
  },
  {
    id: 'preview-order-0525032097',
    sequence: 6,
    sellerOrderKey: '0525032097',
    conditionCode: 'AMBIENT',
    shippedBoxes: 2,
    customerCode: 'abbvie',
    notes: null,
    ...DESTINATIONS.gangseon,
  },
  {
    id: 'preview-order-2018330223',
    sequence: 7,
    sellerOrderKey: '2018330223',
    conditionCode: 'AMBIENT',
    shippedBoxes: 6,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.jioyoungGangbuk,
  },
  {
    id: 'preview-order-2018330266',
    sequence: 8,
    sellerOrderKey: '2018330266',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.daeju,
  },
  {
    id: 'preview-order-2018330232',
    sequence: 9,
    sellerOrderKey: '2018330232',
    conditionCode: 'COLD',
    shippedBoxes: 6,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.incheonShinhub,
  },
  {
    id: 'preview-order-2018330242',
    sequence: 10,
    sellerOrderKey: '2018330242',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.ahnyeoncare,
  },
  {
    id: 'preview-order-2018330276',
    sequence: 11,
    sellerOrderKey: '2018330276',
    conditionCode: 'AMBIENT',
    shippedBoxes: 1,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.seojun,
  },
  {
    id: 'preview-order-0525032197',
    sequence: 12,
    sellerOrderKey: '0525032197',
    conditionCode: 'COLD',
    shippedBoxes: 5,
    customerCode: 'abbvie',
    notes: null,
    ...DESTINATIONS.gangseon,
  },
  {
    id: 'preview-order-2018330224',
    sequence: 13,
    sellerOrderKey: '2018330224',
    conditionCode: 'COLD',
    shippedBoxes: 3,
    customerCode: 'sanofi',
    notes: null,
    ...DESTINATIONS.jioyoungGangbuk,
  },
  {
    id: 'preview-order-2018330265',
    sequence: 14,
    sellerOrderKey: '2018330265',
    conditionCode: 'COLD',
    shippedBoxes: 7,
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

export function buildDeliveryRouteVisualState(
  orders: DeliveryOrder[],
  serverRouteGeometry: ServerDeliveryRouteGeometry | null,
  currentDeliveryStopId: string | null,
): DeliveryRouteVisualState {
  const points = buildDeliveryDestinationPoints(orders);
  const currentOrder = orders.find(({ id }) => id === currentDeliveryStopId);
  const currentDestinationIndex = currentOrder === undefined
    ? -1
    : points.findIndex(
        ({ destinationId }) => destinationId === currentOrder.destinationId,
      );
  const routeIsCompleted =
    orders.length > 0 && orders.every(({ status }) => isTerminalDeliveryStatus(status));

  const markers = points.map((point, index) => ({
    ...point,
    markerState: routeIsCompleted || index < currentDestinationIndex
      ? 'completed' as const
      : index === currentDestinationIndex
        ? 'current' as const
        : 'upcoming' as const,
  }));

  if (serverRouteGeometry === null) {
    return {
      completedGeometry: null,
      currentGeometry: null,
      markers,
      upcomingGeometry: null,
    };
  }
  if (routeIsCompleted) {
    return {
      completedGeometry: serverRouteGeometry,
      currentGeometry: null,
      markers,
      upcomingGeometry: serverRouteGeometry,
    };
  }
  if (currentDestinationIndex < 0) {
    return {
      completedGeometry: null,
      currentGeometry: null,
      markers,
      upcomingGeometry: serverRouteGeometry,
    };
  }

  const routeCoordinates = serverRouteGeometry.coordinates;
  const previousDestination = points[currentDestinationIndex - 1];
  const currentDestination = points[currentDestinationIndex];
  if (currentDestination === undefined || routeCoordinates.length < 2) {
    return {
      completedGeometry: null,
      currentGeometry: null,
      markers,
      upcomingGeometry: serverRouteGeometry,
    };
  }

  const completedRouteIndex = previousDestination === undefined
    ? 0
    : findNearestRouteCoordinateIndex(routeCoordinates, previousDestination.coordinate);
  const currentRouteIndex = findNearestRouteCoordinateIndex(
    routeCoordinates,
    currentDestination.coordinate,
    completedRouteIndex,
  );

  return {
    completedGeometry: completedRouteIndex < 1
      ? null
      : lineStringFromServerSlice(routeCoordinates, 0, completedRouteIndex),
    currentGeometry: currentRouteIndex <= completedRouteIndex
      ? null
      : lineStringFromServerSlice(
          routeCoordinates,
          completedRouteIndex,
          currentRouteIndex,
        ),
    markers,
    upcomingGeometry: serverRouteGeometry,
  };
}

export function resolveDeliveryDestinationProgressState(
  group: DeliveryDestinationGroup,
  currentDeliveryStopId: string | null,
): DeliveryRouteMarkerState {
  if (group.orders.some(({ id }) => id === currentDeliveryStopId)) {
    return 'current';
  }

  return group.orders.every(({ status }) => isTerminalDeliveryStatus(status))
    ? 'completed'
    : 'upcoming';
}

function lineStringFromServerSlice(
  coordinates: [longitude: number, latitude: number][],
  startIndex: number,
  endIndex: number,
): ServerDeliveryRouteGeometry {
  return {
    coordinates: coordinates.slice(startIndex, endIndex + 1),
    type: 'LineString',
  };
}

function findNearestRouteCoordinateIndex(
  routeCoordinates: [longitude: number, latitude: number][],
  target: [longitude: number, latitude: number],
  startIndex = 0,
): number {
  let nearestIndex = Math.max(0, Math.min(startIndex, routeCoordinates.length - 1));
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = nearestIndex; index < routeCoordinates.length; index += 1) {
    const coordinate = routeCoordinates[index];
    if (coordinate === undefined) continue;
    const longitudeDifference = coordinate[0] - target[0];
    const latitudeDifference = coordinate[1] - target[1];
    const distance =
      longitudeDifference * longitudeDifference +
      latitudeDifference * latitudeDifference;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export function isTerminalDeliveryStatus(status: string | undefined): boolean {
  return status !== undefined &&
    ['CANCELLED', 'DELIVERED', 'FAILED', 'SKIPPED'].includes(status);
}

export function completesDeliveryRoute(
  orders: DeliveryOrder[],
  completedDeliveryStopIds: string[],
): boolean {
  if (orders.length === 0) return false;

  const completedStopIds = new Set(completedDeliveryStopIds);
  return orders.every(({ id, status }) => (
    completedStopIds.has(id) || isTerminalDeliveryStatus(status)
  ));
}

export function buildCurrentDeliverySummary(
  orders: DeliveryOrder[],
  deliveryStopId: string | null,
): CurrentDeliverySummary | null {
  if (deliveryStopId === null) {
    return null;
  }

  const currentOrder = orders.find(({ id }) => id === deliveryStopId);
  if (currentOrder === undefined) {
    return null;
  }

  const destinationOrders = orders.filter(
    ({ destinationId }) => destinationId === currentOrder.destinationId,
  );
  const destinationSequence = buildDeliveryDestinationPoints(orders).find(
    ({ destinationId }) => destinationId === currentOrder.destinationId,
  )?.sortOrder ?? 1;
  const constrainedOrders = destinationOrders.filter(
    ({ timeWindowEnd, timeWindowStart }) =>
      timeWindowEnd != null || timeWindowStart != null,
  );
  const earliestConstrainedOrder = [...constrainedOrders].sort((left, right) =>
    (left.timeWindowEnd ?? left.timeWindowStart ?? '').localeCompare(
      right.timeWindowEnd ?? right.timeWindowStart ?? '',
    ),
  )[0];

  return {
    address: currentOrder.address,
    boxCount: destinationOrders.reduce(
      (total, order) => total + order.shippedBoxes,
      0,
    ),
    orderBoxes: destinationOrders.map((order) => ({
      boxCount: order.shippedBoxes,
      conditionCode: order.conditionCode,
      orderId: order.id,
    })),
    deliveryStopId: currentOrder.id,
    deliveryStopIds: destinationOrders
      .filter(({ status }) => !isTerminalDeliveryStatus(status))
      .map(({ id }) => id),
    destinationId: currentOrder.destinationId,
    destinationName: currentOrder.destinationName,
    destinationSequence,
    conditionCodes: [...new Set(destinationOrders.map(({ conditionCode }) => conditionCode))],
    estimatedArrivalAt: currentOrder.estimatedArrivalAt ?? null,
    notes: [...new Set(destinationOrders.flatMap(({ notes }) => notes ? [notes] : []))],
    orderCount: destinationOrders.length,
    timeWindowEnd: earliestConstrainedOrder?.timeWindowEnd ?? null,
    timeWindowOrderCount: constrainedOrders.length,
    timeWindowStart: earliestConstrainedOrder?.timeWindowStart ?? null,
  };
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
