export type DriverPushNotification =
  | {
      kind: 'route_changed';
      notificationId: string;
    }
  | {
      event?: 'applied' | 'cancelled' | 'invalidated' | 'proposed' | 'rejected';
      handoffRequestId: string;
      kind: 'bundle_handoff';
      notificationId: string;
    };

type DriverBundleHandoffEvent = NonNullable<
  Extract<DriverPushNotification, { kind: 'bundle_handoff' }>['event']
>;

const HANDOFF_EVENTS = new Set([
  'applied',
  'cancelled',
  'invalidated',
  'proposed',
  'rejected',
]);

export function parseDriverPushNotification(
  notificationId: string,
  data: Record<string, unknown>,
): DriverPushNotification | null {
  if (data.type === 'driver_route_changed' && isNonEmptyString(data.routePlanId)) {
    return {
      kind: 'route_changed',
      notificationId,
    };
  }
  if (data.type !== 'driver_bundle_handoff' || !isNonEmptyString(data.handoffRequestId)) {
    return null;
  }
  const event = isNonEmptyString(data.handoffEvent) && HANDOFF_EVENTS.has(data.handoffEvent)
    ? data.handoffEvent as DriverBundleHandoffEvent
    : undefined;
  return {
    ...(event === undefined ? {} : { event }),
    handoffRequestId: data.handoffRequestId,
    kind: 'bundle_handoff',
    notificationId,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
