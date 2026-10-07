import { resolveDsvApiUrl } from './dsvApiUrl';

type DriverEventEnvelope = {
  data: { completedStopCount: number; eventIds: string[] } | { eventId: string } | null;
  error?: { code: string; message: string } | null;
};

type RouteLifecycleEventType =
  | 'PICKUP_COMPLETED'
  | 'ROUTE_COMPLETED'
  | 'ROUTE_STARTED'
  | 'TIME_CONSTRAINT_ACKNOWLEDGED';

export type DriverLifecycleCommandIdentity = {
  clientEventId: string;
  occurredAt: string;
};

export class DriverDeliveryCompletionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly outcome: 'rejected' | 'unknown',
    message = '배송 완료 결과를 확인하지 못했습니다.',
  ) {
    super(message);
    this.name = 'DriverDeliveryCompletionApiError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readCompletionEnvelope(response: Response): Promise<Record<string, unknown>> {
  try {
    const envelope: unknown = await response.json();
    if (isObject(envelope)) return envelope;
  } catch { /* A response without a valid result does not prove rejection. */ }
  throw new DriverDeliveryCompletionApiError(response.status, 'INVALID_COMPLETION_RESPONSE', 'unknown');
}

function completionResponseError(response: Response, envelope: Record<string, unknown>) {
  const error = isObject(envelope.error) ? envelope.error : null;
  return new DriverDeliveryCompletionApiError(
    response.status,
    typeof error?.code === 'string' ? error.code : 'COMPLETION_OUTCOME_UNKNOWN',
    !response.ok && error?.completionOutcome === 'NOT_APPLIED' ? 'rejected' : 'unknown',
    typeof error?.message === 'string' ? error.message : undefined,
  );
}

async function recordRouteLifecycleEvent(
  accessToken: string,
  routePlanId: string,
  eventType: RouteLifecycleEventType,
  deliveryStopId?: string,
  identity?: DriverLifecycleCommandIdentity,
): Promise<void> {
  const eventName = eventType === 'ROUTE_STARTED'
    ? 'started'
    : eventType === 'PICKUP_COMPLETED'
      ? 'pickup'
      : eventType === 'ROUTE_COMPLETED'
        ? 'completed'
        : `time:${deliveryStopId}`;
  const response = await fetch(resolveDsvApiUrl('/driver/events'), {
    body: JSON.stringify({
      clientEventId: identity?.clientEventId ?? `${routePlanId}:${eventName}:${Date.now()}`,
      ...(deliveryStopId === undefined ? {} : { deliveryStopId }),
      eventType,
      occurredAt: identity?.occurredAt ?? new Date().toISOString(),
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
      envelope.error?.message ?? (
        eventType === 'ROUTE_COMPLETED'
          ? '배차 완료 상태를 저장하지 못했습니다.'
          : '배송 시작 상태를 저장하지 못했습니다.'
      ),
    );
  }
}

export async function acknowledgeDriverTimeConstraint(
  accessToken: string,
  routePlanId: string,
  deliveryStopId: string,
): Promise<void> {
  await recordRouteLifecycleEvent(
    accessToken,
    routePlanId,
    'TIME_CONSTRAINT_ACKNOWLEDGED',
    deliveryStopId,
  );
}

export async function markDriverOrderMessageRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(resolveDsvApiUrl(
    `/driver/order-messages/${encodeURIComponent(messageId)}/read`,
  ), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    method: 'POST',
  });
  const envelope = (await response.json()) as DriverEventEnvelope;
  if (!response.ok || envelope.data === null) {
    throw new Error(envelope.error?.message ?? '배송원 메모를 확인 처리하지 못했습니다.');
  }
}

export async function startDriverDeliveryRoute(
  accessToken: string,
  routePlanId: string,
): Promise<void> {
  await recordRouteLifecycleEvent(accessToken, routePlanId, 'ROUTE_STARTED');
  await recordRouteLifecycleEvent(accessToken, routePlanId, 'PICKUP_COMPLETED');
}

export async function completeDriverDeliveryRoute(
  accessToken: string,
  routePlanId: string,
  identity?: DriverLifecycleCommandIdentity,
): Promise<void> {
  await recordRouteLifecycleEvent(accessToken, routePlanId, 'ROUTE_COMPLETED', undefined, identity);
}

export async function completeDriverDeliveryDestination(
  accessToken: string,
  routePlanId: string,
  destinationId: string,
  deliveryStopIds: string[],
  identity: DriverLifecycleCommandIdentity,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(resolveDsvApiUrl('/driver/destinations/complete'), {
      body: JSON.stringify({
        clientEventId: identity.clientEventId,
        deliveryStopIds,
        destinationId,
        occurredAt: identity.occurredAt,
        routePlanId,
      }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  } catch {
    throw new DriverDeliveryCompletionApiError(0, 'COMPLETION_OUTCOME_UNKNOWN', 'unknown');
  }
  const envelope = await readCompletionEnvelope(response);
  if (!response.ok) throw completionResponseError(response, envelope);
  const data = envelope.data;
  if (!isObject(data) || data.completedStopCount !== deliveryStopIds.length
    || !Array.isArray(data.eventIds) || data.eventIds.length !== deliveryStopIds.length
    || new Set(data.eventIds).size !== deliveryStopIds.length
    || data.eventIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new DriverDeliveryCompletionApiError(response.status, 'INVALID_COMPLETION_RESPONSE', 'unknown');
  }
}

/** Result-only account authority; this does not grant current route or proof access. */
export async function lookupDriverDeliveryCompletionResult(
  accountAccessToken: string,
  routePlanId: string,
  destinationId: string,
  deliveryStopIds: string[],
  identity: DriverLifecycleCommandIdentity,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(resolveDsvApiUrl('/driver/destinations/complete/result'), {
      body: JSON.stringify({ ...identity, routePlanId, destinationId, deliveryStopIds }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accountAccessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  } catch {
    throw new DriverDeliveryCompletionApiError(0, 'COMPLETION_RESULT_UNAVAILABLE', 'unknown');
  }
  const envelope = await readCompletionEnvelope(response);
  if (!response.ok) throw completionResponseError(response, envelope);
  const data = envelope.data;
  if (!isObject(data) || data.status !== 'APPLIED') return false;
  return data.clientEventId === identity.clientEventId && data.occurredAt === identity.occurredAt
    && data.routePlanId === routePlanId && data.destinationId === destinationId
    && data.completedStopCount === deliveryStopIds.length
    && Array.isArray(data.deliveryStopIds) && data.deliveryStopIds.length === deliveryStopIds.length
    && new Set(data.deliveryStopIds).size === deliveryStopIds.length
    && data.deliveryStopIds.every((id) => typeof id === 'string' && deliveryStopIds.includes(id))
    && Array.isArray(data.eventIds) && data.eventIds.length === deliveryStopIds.length
    && new Set(data.eventIds).size === deliveryStopIds.length
    && data.eventIds.every((id) => typeof id === 'string' && id.length > 0);
}
