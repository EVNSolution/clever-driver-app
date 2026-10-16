import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { uploadDriverProofPhoto } from './dsvDriverProofMedia';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver proof media API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('uploads one selected proof photo in the approved multipart contract', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: {
          contentType: 'image/jpeg',
          kind: 'photo',
          mediaId: 'media-1',
          sha256: 'hash',
          sizeBytes: 128,
          source: 'library',
          storageKey: 'driver-proof/media-1.jpg',
          uploadedAt: '2026-08-03T12:00:00.000Z',
        },
        error: null,
      }), { status: 201 });
    };

    const result = await uploadDriverProofPhoto(
      'route-token',
      {
        deliveryStopId: 'stop-1',
        fileName: 'proof.jpg',
        idempotencyKey: 'proof-media-v1:0123456789abcdef0123456789abcdef',
        mimeType: 'image/jpeg',
        routePlanId: 'route-1',
        source: 'library',
        uri: 'file:///proof.jpg',
      },
      {
        fetch: globalThis.fetch,
        file: new Blob(['proof'], { type: 'image/jpeg' }),
      },
    );

    assert.equal(result.mediaId, 'media-1');
    assert.equal(request?.input, 'https://dsv.example.test/driver/proof-media');
    assert.equal(request?.init?.method, 'POST');
    assert.equal(
      (request?.init?.headers as Record<string, string>).Authorization,
      'Bearer route-token',
    );
    assert.equal(
      (request?.init?.headers as Record<string, string>)['Content-Type'],
      undefined,
    );
    const body = request?.init?.body as FormData;
    assert.equal(body.get('deliveryStopId'), 'stop-1');
    assert.equal(body.get('routePlanId'), 'route-1');
    assert.equal(body.get('source'), 'library');
  });

  it('retains the selected photo idempotency key across a stored response loss', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const keys: unknown[] = [];
    const input = { deliveryStopId: 'stop-1', fileName: 'proof.jpg', mimeType: 'image/jpeg', routePlanId: 'route-1', source: 'library' as const, uri: 'file:///proof.jpg', idempotencyKey: 'proof-media-v1:0123456789abcdef0123456789abcdef' };
    const runtime = {
      file: new Blob(['proof'], { type: 'image/jpeg' }),
      fetch: async (_url: string, request: RequestInit) => {
        keys.push((request.headers as Record<string, string>)['Idempotency-Key']);
        if (keys.length === 1) throw new Error('stored response lost');
        return new Response(JSON.stringify({ data: { mediaId: 'original-media' } }));
      },
    };
    await assert.rejects(uploadDriverProofPhoto('route-token', input, runtime), /stored response lost/u);
    assert.equal((await uploadDriverProofPhoto('route-token', input, runtime)).mediaId, 'original-media');
    assert.deepEqual(keys, [input.idempotencyKey, input.idempotencyKey]);
  });
});
