import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverDeliveryBundle = {
  address: string;
  boxCount: number;
  conditionCodes: string[];
  destinationId: string;
  destinationName: string;
  orderCount: number;
};

export type DriverDeliveryRecipient = {
  driverId: string;
  driverName: string;
};

export type DriverDeliverySpace = {
  available: DriverDeliveryBundle[];
  mine: DriverDeliveryBundle[];
  recipients: DriverDeliveryRecipient[];
  version: string;
};

type ApiEnvelope<T> = {
  data: T | null;
  error?: { code: string; message: string } | null;
};

export class DriverDeliverySpaceApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DriverDeliverySpaceApiError';
  }
}

export async function loadDriverDeliverySpace(accessToken: string): Promise<DriverDeliverySpace> {
  return request<DriverDeliverySpace>('/driver/delivery-space', accessToken);
}

export function releaseDeliveryBundle(
  accessToken: string,
  destinationId: string,
  expectedVersion: string,
): Promise<unknown> {
  return command(accessToken, destinationId, expectedVersion, 'release');
}

export function acquireDeliveryBundle(
  accessToken: string,
  destinationId: string,
  expectedVersion: string,
): Promise<unknown> {
  return command(accessToken, destinationId, expectedVersion, 'acquire');
}

export function transferDeliveryBundle(
  accessToken: string,
  destinationId: string,
  expectedVersion: string,
  targetDriverId: string,
): Promise<unknown> {
  return request(
    `/driver/delivery-space/${encodeURIComponent(destinationId)}/transfer`,
    accessToken,
    {
      body: JSON.stringify({ expectedVersion, targetDriverId }),
      method: 'POST',
    },
  );
}

function command(
  accessToken: string,
  destinationId: string,
  expectedVersion: string,
  action: 'acquire' | 'release',
): Promise<unknown> {
  return request(
    `/driver/delivery-space/${encodeURIComponent(destinationId)}/${action}`,
    accessToken,
    { body: JSON.stringify({ expectedVersion }), method: 'POST' },
  );
}

async function request<T>(
  path: string,
  accessToken: string,
  init: Pick<RequestInit, 'body' | 'method'> = {},
): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(resolveDsvApiUrl(path), { ...init, headers });
  const envelope = await response.json() as ApiEnvelope<T>;
  if (
    !response.ok ||
    envelope.data === null ||
    envelope.data === undefined
  ) {
    throw new DriverDeliverySpaceApiError(
      envelope.error?.code ?? `DELIVERY_SPACE_HTTP_${response.status}`,
      envelope.error?.message ?? '주문 목록 서버 연결을 확인할 수 없습니다.',
    );
  }
  return envelope.data;
}
