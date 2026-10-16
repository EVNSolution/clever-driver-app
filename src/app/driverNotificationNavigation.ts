import { DriverOperationalApiError, resolveDriverOperationalNotification, type DriverNotificationResolution } from '../api/dsvDriverOperational';
import { isDriverOperationalUuid } from '../domain/notifications/driverOperationalIdentity';
import type { DriverNotificationClick } from '../domain/notifications/driverPushNotification';

export type DriverNotificationDestination = {
  notificationId: string;
  executionContextId: string;
  routePlanId: string;
  targetStopId?: string;
};
export type DriverNotificationNavigation =
  | { kind: 'destination'; destination: DriverNotificationDestination }
  | { kind: 'notice'; message: string; acknowledgeOpened: boolean }
  | { kind: 'refresh' };

// Payloads supply notification identity only. The authenticated resolver owns destinations.
export async function resolveDriverNotificationClick(
  click: DriverNotificationClick,
  accessToken: string,
  resolve: (token: string, id: string) => Promise<DriverNotificationResolution> = resolveDriverOperationalNotification,
): Promise<DriverNotificationNavigation> {
  if (click.kind === 'unsupported') return { kind: 'notice', message: '이 알림 형식은 지원하지 않습니다. 앱 버전과 알림함을 확인해 주세요.', acknowledgeOpened: false };
  if (click.kind === 'route_changed' || click.kind === 'bundle_handoff') return { kind: 'refresh' };
  if (click.status === 'expired' || Date.parse(click.expiresAt) <= Date.now()) {
    return { kind: 'notice', message: '이 알림은 만료되었습니다. 최신 알림함을 확인해 주세요.', acknowledgeOpened: false };
  }
  let resolution: DriverNotificationResolution;
  try {
    resolution = await resolve(accessToken, click.notificationId);
  } catch (error) {
    if (click.kind === 'N06' && error instanceof DriverOperationalApiError
      && error.code === 'INVALID_RESPONSE' && error.status >= 200 && error.status < 300) {
      return invalidTargetNotice();
    }
    throw error;
  }
  if (resolution.notificationId !== click.notificationId) throw new Error('NOTIFICATION_ID_MISMATCH');
  if (click.kind === 'N03') {
    return { kind: 'notice', message: '이 배차의 배정이 해제되었습니다.', acknowledgeOpened: true };
  }
  if (click.kind === 'N06' && (resolution.destination.type !== 'EXECUTION'
    || !isDriverOperationalUuid(resolution.destination.targetStopId))) {
    return invalidTargetNotice();
  }
  if (resolution.destination.type === 'ASSIGNMENT_RELEASED') {
    return { kind: 'notice', message: '이 배차의 배정이 해제되었습니다.', acknowledgeOpened: true };
  }
  return { kind: 'destination', destination: { notificationId: click.notificationId, ...resolution.destination } };
}

function invalidTargetNotice(): Extract<DriverNotificationNavigation, { kind: 'notice' }> {
  return { kind: 'notice', message: '알림의 배송지를 확인할 수 없습니다. 최신 알림함을 확인해 주세요.', acknowledgeOpened: false };
}
