import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverAccountDeletionRequest = {
  duplicate: boolean;
  requestId: string;
  status: 'REQUESTED';
};

type ApiEnvelope<T> = {
  data: T | null;
  error?: { code: string; message: string } | null;
};

export class DriverAccountApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DriverAccountApiError';
  }
}

export async function requestDriverAccountDeletion(
  accessToken: string,
): Promise<DriverAccountDeletionRequest> {
  const response = await fetch(resolveDsvApiUrl('/driver/account-deletion-requests'), {
    body: JSON.stringify({ confirmation: 'DELETE' }),
    headers: new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });
  const envelope = await response.json() as ApiEnvelope<DriverAccountDeletionRequest>;
  if (!response.ok || envelope.data === null || envelope.data === undefined) {
    throw new DriverAccountApiError(
      envelope.error?.code ?? `DRIVER_ACCOUNT_HTTP_${response.status}`,
      envelope.error?.message ?? '계정 삭제 요청을 접수하지 못했습니다.',
    );
  }
  if (envelope.data.status !== 'REQUESTED') {
    throw new DriverAccountApiError(
      'INVALID_ACCOUNT_DELETION_RESPONSE',
      '계정 삭제 요청 상태를 확인할 수 없습니다.',
    );
  }
  return envelope.data;
}
