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

export function registerDriverPushToken(
  accessToken: string,
  registration: DriverPushTokenRegistration,
): Promise<void> {
  return request(accessToken, 'PUT', registration);
}

export function revokeDriverPushToken(
  accessToken: string,
  devicePushToken: string,
): Promise<void> {
  return request(accessToken, 'DELETE', { devicePushToken });
}

async function request(
  accessToken: string,
  method: 'DELETE' | 'PUT',
  body: DriverPushTokenRegistration | { devicePushToken: string },
): Promise<void> {
  const response = await fetch(resolveDsvApiUrl('/api/driver/mobile/push-token'), {
    body: JSON.stringify(body),
    headers: new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    method,
  });
  if (!response.ok) {
    throw new Error(`DRIVER_PUSH_TOKEN_HTTP_${response.status}`);
  }
}
