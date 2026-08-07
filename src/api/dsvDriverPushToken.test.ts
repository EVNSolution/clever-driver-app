import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  registerDriverPushToken,
  revokeDriverPushToken,
} from './dsvDriverPushToken';

const ORIGINAL_BASE_URL = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

describe('DSV driver push token API client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('registers the Android FCM token for the Driver app with account auth', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({
        data: { pushToken: { id: 'push-1', status: 'ACTIVE' } },
        error: null,
      }));
    };

    await registerDriverPushToken('account-token', {
      appId: 'com.evnsolution.clever.driver',
      appVersion: '0.1.3',
      deviceId: 'android-device',
      devicePushToken: 'fcm-token',
      locale: 'ko-KR',
      platform: 'android',
      timezone: 'Asia/Seoul',
    });

    assert.equal(request?.input, 'https://dsv.example.test/api/driver/mobile/push-token');
    assert.equal(request?.init?.method, 'PUT');
    assert.equal(
      (request?.init?.headers as Headers).get('Authorization'),
      'Bearer account-token',
    );
    assert.deepEqual(JSON.parse(request?.init?.body as string), {
      appId: 'com.evnsolution.clever.driver',
      appVersion: '0.1.3',
      deviceId: 'android-device',
      devicePushToken: 'fcm-token',
      locale: 'ko-KR',
      platform: 'android',
      timezone: 'Asia/Seoul',
    });
  });

  it('revokes the exact FCM token on logout', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    let request: { input: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { input: input.toString(), init };
      return new Response(JSON.stringify({ data: { revoked: true }, error: null }));
    };

    await revokeDriverPushToken('account-token', 'fcm-token');

    assert.equal(request?.init?.method, 'DELETE');
    assert.equal(
      (request?.init?.headers as Headers).get('Authorization'),
      'Bearer account-token',
    );
    assert.deepEqual(JSON.parse(request?.init?.body as string), {
      devicePushToken: 'fcm-token',
    });
  });
});
