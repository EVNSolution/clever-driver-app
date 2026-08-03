import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverProofPhotoSource = 'camera' | 'library';

export type DriverProofPhotoUpload = {
  deliveryStopId: string;
  fileName: string;
  mimeType: string;
  routePlanId: string;
  source: DriverProofPhotoSource;
  uri: string;
};

type DriverProofMedia = {
  contentType: string;
  kind: 'photo';
  mediaId: string;
  sha256: string;
  sizeBytes: number;
  source: DriverProofPhotoSource;
  storageKey: string;
  uploadedAt: string;
};

type DriverProofMediaEnvelope = {
  data: DriverProofMedia | null;
  error?: { code: string; message: string } | null;
};

export async function uploadDriverProofPhoto(
  accessToken: string,
  input: DriverProofPhotoUpload,
): Promise<DriverProofMedia> {
  const body = new FormData();
  body.append('deliveryStopId', input.deliveryStopId);
  body.append('routePlanId', input.routePlanId);
  body.append('source', input.source);
  body.append('file', {
    name: input.fileName,
    type: input.mimeType,
    uri: input.uri,
  } as unknown as Blob);

  const response = await fetch(resolveDsvApiUrl('/driver/proof-media'), {
    body,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    method: 'POST',
  });
  const envelope = (await response.json()) as DriverProofMediaEnvelope;
  if (!response.ok || envelope.data === null) {
    throw new Error(
      envelope.error?.message ?? '배송 증빙 사진을 업로드하지 못했습니다.',
    );
  }

  return envelope.data;
}
