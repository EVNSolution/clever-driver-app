import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  DriverAccountApiError,
  requestDriverAccountDeletion,
} from './dsvDriverAccount';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver account API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('submits an authenticated full-account deletion request', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: { duplicate: false, requestId: 'request-1', status: 'REQUESTED' },
        error: null,
      }), { status: 202 });
    };

    const result = await requestDriverAccountDeletion('account-token');

    assert.deepEqual(result, {
      duplicate: false,
      requestId: 'request-1',
      status: 'REQUESTED',
    });
    assert.equal(
      request?.input,
      'https://dsv.example.test/driver/account-deletion-requests',
    );
    assert.equal(request?.init?.method, 'POST');
    assert.equal(
      (request?.init?.headers as Headers).get('Authorization'),
      'Bearer account-token',
    );
    assert.deepEqual(JSON.parse(request?.init?.body as string), {
      confirmation: 'DELETE',
    });
  });

  it('preserves the active-route error code for the settings UI', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: null,
      error: {
        code: 'ACCOUNT_DELETION_ACTIVE_ROUTE',
        message: 'Finish or release the active route before requesting account deletion',
      },
    }), { status: 409 });

    await assert.rejects(
      () => requestDriverAccountDeletion('account-token'),
      (error) => error instanceof DriverAccountApiError
        && error.code === 'ACCOUNT_DELETION_ACTIVE_ROUTE',
    );
  });
});
