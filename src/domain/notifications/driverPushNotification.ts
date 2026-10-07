import { isDriverOperationalUuid } from './driverOperationalIdentity';

export const DRIVER_OPERATIONAL_NOTIFICATION_KINDS = ['N01', 'N02', 'N03', 'N04', 'N05', 'N06'] as const;
export type DriverOperationalPushKind = typeof DRIVER_OPERATIONAL_NOTIFICATION_KINDS[number];
export type DriverOperationalPushNotification = {
  expiresAt: string;
  kind: DriverOperationalPushKind;
  notificationId: string;
  schemaVersion: '1';
  status: 'current' | 'expired';
};
export type DriverPushNotification =
  | DriverOperationalPushNotification
  | { kind: 'route_changed'; notificationId: string }
  | {
      event?: 'applied' | 'cancelled' | 'invalidated' | 'proposed' | 'rejected';
      handoffRequestId: string;
      kind: 'bundle_handoff';
      notificationId: string;
    };
export type DriverNotificationClick = DriverPushNotification | {
  kind: 'unsupported';
  notificationId: string;
  reason: 'UNSUPPORTED_PAYLOAD';
};

type DriverBundleHandoffEvent = NonNullable<Extract<DriverPushNotification, { kind: 'bundle_handoff' }>['event']>;
const HANDOFF_EVENTS = new Set(['applied', 'cancelled', 'invalidated', 'proposed', 'rejected']);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export function isDriverOperationalPushNotification(
  notification: DriverNotificationClick,
): notification is DriverOperationalPushNotification {
  return (DRIVER_OPERATIONAL_NOTIFICATION_KINDS as readonly string[]).includes(notification.kind);
}

export function parseDriverPushNotification(
  notificationId: string,
  data: Record<string, unknown>,
  now = Date.now(),
): DriverPushNotification | null {
  if ('schemaVersion' in data || 'kind' in data) {
    if (data.schemaVersion !== '1'
      || typeof data.kind !== 'string'
      || !(DRIVER_OPERATIONAL_NOTIFICATION_KINDS as readonly string[]).includes(data.kind)
      || !isDriverOperationalUuid(data.notificationId)
      || !isUtcInstant(data.expiresAt)
      || Object.keys(data).some((key) => !['schemaVersion', 'kind', 'notificationId', 'expiresAt'].includes(key))) {
      return null;
    }
    return {
      expiresAt: data.expiresAt,
      kind: data.kind as DriverOperationalPushKind,
      notificationId: data.notificationId,
      schemaVersion: '1',
      status: Date.parse(data.expiresAt) <= now ? 'expired' : 'current',
    };
  }
  if (data.type === 'driver_route_changed' && isNonEmptyString(data.routePlanId)) {
    return { kind: 'route_changed', notificationId };
  }
  if (data.type !== 'driver_bundle_handoff' || !isNonEmptyString(data.handoffRequestId)) return null;
  const event = isNonEmptyString(data.handoffEvent) && HANDOFF_EVENTS.has(data.handoffEvent)
    ? data.handoffEvent as DriverBundleHandoffEvent : undefined;
  return {
    ...(event === undefined ? {} : { event }),
    handoffRequestId: data.handoffRequestId,
    kind: 'bundle_handoff',
    notificationId,
  };
}

export function classifyDriverNotificationClick(
  notificationId: string,
  data: Record<string, unknown>,
  now = Date.now(),
): DriverNotificationClick {
  return parseDriverPushNotification(notificationId, data, now)
    ?? { kind: 'unsupported', notificationId, reason: 'UNSUPPORTED_PAYLOAD' };
}

function isUtcInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    && new Date(parsed).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
