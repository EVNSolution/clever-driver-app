import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  AuthApiError,
  loginDriverAccount,
  refreshDriverAccountSession,
  registerDriverAccount,
} from './dsvDriverAuth';
import { resolveDsvApiUrl } from './dsvApiUrl';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

const SUCCESS_DATA = {
  account: {
    id: 'account-1',
    loginId: 'driver01',
    name: '홍길동',
    phone: '01012345678',
    connectionStatus: 'LINKED',
    linkedDrivers: [
      {
        driverId: 'driver-1',
        name: '홍길동',
        shopDomain: 'sample.myshopify.com',
      },
    ],
  },
  accessToken: 'access-token',
  expiresAt: '2026-08-02T10:00:00.000Z',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: '2026-09-02T10:00:00.000Z',
  tokenType: 'Bearer',
  ttlSeconds: 3600,
  use: 'dsv_driver_account',
} as const;

describe('DSV driver auth API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('posts direct registration identity without an invite token', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: { input: string | URL | Request; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          data: SUCCESS_DATA,
          error: null,
        }),
        { status: 200 },
      );
    };

    const result = await registerDriverAccount({
      loginId: 'kim.sambong@example.com',
      password: 'password123',
      name: '홍길동',
      phone: '01012345678',
    });

    assert.deepEqual(result, SUCCESS_DATA);
    assert.equal(
      calls[0]?.input.toString(),
      'https://dsv.example.test/api/dsv/driver/auth/register',
    );
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0]?.init?.body as string), {
      loginId: 'kim.sambong@example.com',
      password: 'password123',
      name: '홍길동',
      phone: '01012345678',
    });
  });

  it('posts login data to the approved DSV endpoint', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'http://localhost:3000';
    let requestBody: unknown;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(init?.body as string);

      return new Response(
        JSON.stringify({
          data: SUCCESS_DATA,
          error: null,
        }),
        { status: 200 },
      );
    };

    const result = await loginDriverAccount({
      loginId: 'kim.sambong@example.com',
      password: 'password123',
    });

    assert.equal(result.use, 'dsv_driver_account');
    assert.deepEqual(requestBody, {
      loginId: 'kim.sambong@example.com',
      password: 'password123',
    });
  });

  it('refreshes the stored DSV session without resending credentials', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let requestUrl = '';
    let requestBody: unknown;
    globalThis.fetch = async (input, init) => {
      requestUrl = input.toString();
      requestBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ data: SUCCESS_DATA, error: null }));
    };

    const result = await refreshDriverAccountSession({
      refreshToken: 'refresh-token',
    });

    assert.equal(result.use, 'dsv_driver_account');
    assert.equal(
      requestUrl,
      'https://dsv.example.test/api/dsv/driver/auth/refresh',
    );
    assert.deepEqual(requestBody, { refreshToken: 'refresh-token' });
  });

  it('defaults to production and rejects insecure non-local API base URLs', async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = async () => {
      fetchCalls.push('called');
      throw new Error('fetch should not be called');
    };

    delete process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
    assert.equal(
      resolveDsvApiUrl('/api/dsv/driver/auth/login'),
      'https://clever-route-api.cleversystem.ai/api/dsv/driver/auth/login',
    );

    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'http://dsv.example.test';
    await assert.rejects(
      () => loginDriverAccount({ loginId: 'driver01', password: 'password123' }),
      /https/,
    );

    assert.deepEqual(fetchCalls, []);
  });

  it('surfaces server error envelopes without persisting tokens', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: null,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '아이디 또는 비밀번호를 확인해 주세요.',
          },
        }),
        { status: 401 },
      );

    await assert.rejects(
      () => loginDriverAccount({ loginId: 'driver01', password: 'password123' }),
      (error) =>
        error instanceof AuthApiError &&
        error.code === 'INVALID_CREDENTIALS' &&
        error.message === '아이디 또는 비밀번호를 확인해 주세요.',
    );
  });
});
