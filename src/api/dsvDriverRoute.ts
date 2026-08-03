import type {
  DeliveryOrder,
  ServerDeliveryRouteGeometry,
} from '../domain/delivery/deliveryPlan';
import { resolveDsvApiUrl } from './dsvApiUrl';

type RouteChoice = {
  companyGuidance: { deliveryDate: string; routeName: string };
  driverAccess: { accessToken: string };
  routeAccess: { routeContext: string; routePlanId: string };
};

type RouteLookupEnvelope = {
  data: { status: string; routes?: RouteChoice[] } | null;
  error?: { code: string; message: string } | null;
};

type AssignedRouteStop = {
  address: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    postalCode: string | null;
    province: string | null;
  };
  conditionCode: string | null;
  coordinates: { latitude: number | null; longitude: number | null };
  deliveryStopId: string;
  destinationId: string | null;
  orderName: string;
  recipientName: string | null;
  sellerOrderKey: string | null;
  sequence: number;
  shippedBoxes: number | null;
  status: string;
};

type AssignedRouteEnvelope = {
  data: {
    status: string;
    route?: {
      deliveryDate: string;
      id: string;
      name: string;
      routeGeometry: ServerDeliveryRouteGeometry | null;
      stops: AssignedRouteStop[];
    };
  } | null;
  error?: { code: string; message: string } | null;
};

export type DriverDeliveryRoute = {
  availableRoutes: DriverDeliveryRouteChoice[];
  deliveryDate: string;
  orders: DeliveryOrder[];
  routeId: string;
  routeName: string;
  routePlanId: string;
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
};

export type DriverDeliveryRouteChoice = {
  deliveryDate: string;
  routeAccessToken: string;
  routeContext: string;
  routeName: string;
  routePlanId: string;
};

export class DriverRouteApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DriverRouteApiError';
  }
}

export async function loadDriverDeliveryRoute(
  accountAccessToken: string,
  selectedRoutePlanId?: string,
): Promise<DriverDeliveryRoute | null> {
  const routeChoices = await loadDriverDeliveryRouteChoices(accountAccessToken);
  const routeChoice =
    routeChoices.find(({ routePlanId }) => routePlanId === selectedRoutePlanId) ??
    routeChoices[0];

  if (routeChoice === undefined) {
    return null;
  }

  const query = new URLSearchParams({
    routeContext: routeChoice.routeContext,
  });
  const assignedEnvelope = await requestJson<AssignedRouteEnvelope>(
    `/driver/assigned-route?${query.toString()}`,
    routeChoice.routeAccessToken,
  );

  if (assignedEnvelope.data === null) {
    throwEnvelopeError(assignedEnvelope.error);
  }
  if (assignedEnvelope.data.status === 'NO_ASSIGNED_ROUTE') {
    return null;
  }

  const route = assignedEnvelope.data.route;
  if (assignedEnvelope.data.status !== 'ASSIGNED_ROUTE' || route === undefined) {
    throw new DriverRouteApiError(
      'INVALID_ROUTE_RESPONSE',
      'DSV 배송 경로 응답을 확인할 수 없습니다.',
    );
  }

  return {
    deliveryDate: route.deliveryDate,
    orders: route.stops.map(mapAssignedRouteStop),
    routeId: route.id,
    routeName: route.name,
    routePlanId: routeChoice.routePlanId,
    serverRouteGeometry: readServerRouteGeometry(route.routeGeometry),
    availableRoutes: routeChoices,
  };
}

export async function loadDriverDeliveryRouteChoices(
  accountAccessToken: string,
): Promise<DriverDeliveryRouteChoice[]> {
  const lookupEnvelope = await requestJson<RouteLookupEnvelope>(
    '/driver/route-access/lookup',
    accountAccessToken,
    { body: JSON.stringify({ routeContext: null }), method: 'POST' },
  );

  if (lookupEnvelope.data === null) {
    throwEnvelopeError(lookupEnvelope.error);
  }
  if (lookupEnvelope.data.status !== 'ROUTES_FOUND') {
    throw new DriverRouteApiError(
      'ROUTE_NOT_AVAILABLE',
      '현재 계정으로 확인할 수 있는 배송 경로가 없습니다.',
    );
  }

  return [...(lookupEnvelope.data.routes ?? [])]
    .map((choice) => ({
      deliveryDate: choice.companyGuidance.deliveryDate,
      routeAccessToken: choice.driverAccess.accessToken,
      routeContext: choice.routeAccess.routeContext,
      routeName: choice.companyGuidance.routeName,
      routePlanId: choice.routeAccess.routePlanId,
    }))
    .sort((left, right) =>
      right.deliveryDate.localeCompare(left.deliveryDate) ||
      left.routeName.localeCompare(right.routeName),
    );
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  init: Pick<RequestInit, 'body' | 'method'> = {},
): Promise<T> {
  let url: string;
  try {
    url = resolveDsvApiUrl(path);
  } catch (error) {
    throw new DriverRouteApiError(
      'INVALID_API_BASE_URL',
      error instanceof Error ? error.message : 'DSV API 기본 주소를 확인해 주세요.',
    );
  }

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });
  return (await response.json()) as T;
}

function mapAssignedRouteStop(stop: AssignedRouteStop): DeliveryOrder {
  const { latitude, longitude } = stop.coordinates;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    stop.sellerOrderKey === null ||
    stop.conditionCode === null ||
    !Number.isFinite(stop.shippedBoxes)
  ) {
    throw new DriverRouteApiError(
      'INCOMPLETE_DSV_STOP',
      `DSV 주문 ${stop.orderName}의 배송 데이터가 완전하지 않습니다.`,
    );
  }

  return {
    address: [
      stop.address.province,
      stop.address.city,
      stop.address.address1,
      stop.address.address2,
      stop.address.postalCode,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .filter((part, index, parts) => parts.indexOf(part) === index)
      .join(' '),
    conditionCode: stop.conditionCode,
    coordinate: { latitude: latitude as number, longitude: longitude as number },
    customerCode: '',
    destinationId: stop.destinationId ?? stop.deliveryStopId,
    destinationName: stop.recipientName?.trim() || stop.orderName,
    id: stop.deliveryStopId,
    notes: null,
    sellerOrderKey: stop.sellerOrderKey,
    sequence: stop.sequence,
    shippedBoxes: stop.shippedBoxes as number,
  };
}

function readServerRouteGeometry(
  geometry: ServerDeliveryRouteGeometry | null,
): ServerDeliveryRouteGeometry | null {
  if (
    geometry === null ||
    geometry.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    geometry.coordinates.some(
      (coordinate) =>
        !Array.isArray(coordinate) ||
        coordinate.length !== 2 ||
        !coordinate.every(Number.isFinite),
    )
  ) {
    return null;
  }

  return geometry;
}

function throwEnvelopeError(
  error: { code: string; message: string } | null | undefined,
): never {
  throw new DriverRouteApiError(
    error?.code ?? 'DSV_API_ERROR',
    error?.message ?? 'DSV 서버 응답을 확인할 수 없습니다.',
  );
}
