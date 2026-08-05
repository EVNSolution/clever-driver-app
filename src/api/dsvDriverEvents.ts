import { resolveDsvApiUrl } from './dsvApiUrl';

type DriverEventEnvelope = {
  data: { completedStopCount: number; eventIds: string[] } | { eventId: string } | null;
  error?: { code: string; message: string } | null;
};

type RouteLifecycleEventType = 'PICKUP_COMPLETED' | 'ROUTE_STARTED';

async function recordRouteLifecycleEvent(
  accessToken: string,
  routePlanId: string,
  eventType: RouteLifecycleEventType,
): Promise<void> {
  const eventName = eventType === 'ROUTE_STARTED' ? 'started' : 'pickup';
  const response = await fetch(resolveDsvApiUrl('/driver/events'), {
    body: JSON.stringify({
      clientEventId: `${routePlanId}:${eventName}:${Date.now()}`,
      eventType,
      occurredAt: new Date().toISOString(),
      routePlanId,
    }),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const envelope = (await response.json()) as DriverEventEnvelope;
  if (!response.ok || envelope.data === null) {
    throw new Error(
      envelope.error?.message ?? '배송 시작 상태를 저장하지 못했습니다.',
    );
  }
}

export async function startDriverDeliveryRoute(
  accessToken: string,
  routePlanId: string,
): Promise<void> {
  await recordRouteLifecycleEvent(accessToken, routePlanId, 'ROUTE_STARTED');
  await recordRouteLifecycleEvent(accessToken, routePlanId, 'PICKUP_COMPLETED');
}

export async function completeDriverDeliveryDestination(
  accessToken: string,
  routePlanId: string,
  destinationId: string,
  deliveryStopIds: string[],
): Promise<void> {
  const response = await fetch(resolveDsvApiUrl('/driver/destinations/complete'), {
    body: JSON.stringify({
      clientEventId: `${destinationId}:delivered:${Date.now()}`,
      deliveryStopIds,
      destinationId,
      occurredAt: new Date().toISOString(),
      routePlanId,
    }),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const envelope = (await response.json()) as DriverEventEnvelope;
  if (!response.ok || envelope.data === null) {
    throw new Error(
      envelope.error?.message ?? '배송지의 주문을 한 번에 완료 처리하지 못했습니다.',
    );
  }
}
