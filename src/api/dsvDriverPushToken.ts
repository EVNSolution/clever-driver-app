import {
  DRIVER_OPERATIONAL_NOTIFICATION_KINDS,
  type DriverOperationalPushKind,
} from '../domain/notifications/driverPushNotification';
import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverPushTokenRegistration = {
  appId: string;
  appVersion?: string;
  deviceId?: string;
  devicePushToken: string;
  locale?: string;
  platform: 'android';
  timezone?: string;
};
export type DriverPushTokenResult = { tokenId: string };
type RegisterCapability = (accessToken: string, input: {
  installationId: string;
  kinds: DriverOperationalPushKind[];
  schemaVersion: 1;
  tokenId: string;
}) => Promise<unknown>;

export async function registerDriverPushToken(
  accessToken: string,
  registration: DriverPushTokenRegistration,
): Promise<DriverPushTokenResult> {
  const response = await request(accessToken, 'PUT', registration);
  const value: unknown = await response.json();
  if (!isRecord(value) || value.error !== null || !isRecord(value.data)
    || !isRecord(value.data.pushToken) || value.data.pushToken.status !== 'ACTIVE'
    || typeof value.data.pushToken.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value.data.pushToken.id)) {
    throw new Error('DRIVER_PUSH_TOKEN_INVALID_RESPONSE');
  }
  return { tokenId: value.data.pushToken.id };
}

/** Token renewal invalidates server capability. Advertise again only after the token PUT succeeds. */
export async function registerDriverPushTokenWithCapability(
  accessToken: string,
  registration: DriverPushTokenRegistration,
  options: { operationalEnabled: boolean; registerCapability: RegisterCapability; isCurrent?: () => boolean; onTokenRegistered?: () => Promise<void> },
): Promise<DriverPushTokenResult> {
  if (options.operationalEnabled && !registration.deviceId?.trim()) {
    throw new Error('DRIVER_PUSH_INSTALLATION_REQUIRED');
  }
  const result = await registerDriverPushToken(accessToken, registration);
  await options.onTokenRegistered?.();
  if (options.operationalEnabled && (options.isCurrent?.() ?? true)) {
    await options.registerCapability(accessToken, {
      installationId: registration.deviceId!,
      kinds: [...DRIVER_OPERATIONAL_NOTIFICATION_KINDS],
      schemaVersion: 1,
      tokenId: result.tokenId,
    });
  }
  return result;
}

export async function revokeDriverPushToken(accessToken: string, devicePushToken: string): Promise<void> {
  await request(accessToken, 'DELETE', { devicePushToken });
}
async function request(
  accessToken: string,
  method: 'DELETE' | 'PUT',
  body: DriverPushTokenRegistration | { devicePushToken: string },
): Promise<Response> {
  const response = await fetch(resolveDsvApiUrl('/api/driver/mobile/push-token'), {
    body: JSON.stringify(body),
    headers: new Headers({ Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }),
    method,
  });
  if (!response.ok) throw new Error(`DRIVER_PUSH_TOKEN_HTTP_${response.status}`);
  return response;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
