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
  incomingHandoffs: DriverDeliveryIncomingHandoff[];
  mine: DriverDeliveryBundle[];
  outgoingHandoffs: DriverDeliveryOutgoingHandoff[];
  recipients: DriverDeliveryRecipient[];
  version: string;
};

export type DriverDeliveryHandoffStatus =
  | 'APPLIED'
  | 'CANCELLED'
  | 'INVALIDATED'
  | 'PROPOSED'
  | 'REJECTED';

export type DriverDeliveryIncomingHandoff = {
  bundle: DriverDeliveryBundle;
  expiresAt: string;
  requestId: string;
  senderDriverName: string;
  status: DriverDeliveryHandoffStatus;
};

export type DriverDeliveryOutgoingHandoff = {
  bundle?: DriverDeliveryBundle;
  destinationId?: string;
  expiresAt: string;
  requestId: string;
  status: DriverDeliveryHandoffStatus;
  targetDriverName: string;
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
  const space = await request<DriverDeliverySpace>('/driver/delivery-space', accessToken);
  return {
    ...space,
    incomingHandoffs: space.incomingHandoffs ?? [],
    outgoingHandoffs: space.outgoingHandoffs ?? [],
    recipients: space.recipients ?? [],
  };
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

export function requestDeliveryBundleHandoff(
  accessToken: string,
  destinationId: string,
  expectedVersion: string,
  targetDriverId: string,
): Promise<unknown> {
  return request(
    `/driver/delivery-space/${encodeURIComponent(destinationId)}/handoff-requests`,
    accessToken,
    {
      body: JSON.stringify({ expectedVersion, targetDriverId }),
      method: 'POST',
    },
  );
}

export function acceptDeliveryBundleHandoff(
  accessToken: string,
  requestId: string,
): Promise<unknown> {
  return handoffCommand(accessToken, requestId, 'accept');
}

export function rejectDeliveryBundleHandoff(
  accessToken: string,
  requestId: string,
): Promise<unknown> {
  return handoffCommand(accessToken, requestId, 'reject');
}

export function cancelDeliveryBundleHandoff(
  accessToken: string,
  requestId: string,
): Promise<unknown> {
  return handoffCommand(accessToken, requestId, 'cancel');
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

function handoffCommand(
  accessToken: string,
  requestId: string,
  action: 'accept' | 'cancel' | 'reject',
): Promise<unknown> {
  return request(
    `/driver/delivery-space/handoff-requests/${encodeURIComponent(requestId)}/${action}`,
    accessToken,
    { method: 'POST' },
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
