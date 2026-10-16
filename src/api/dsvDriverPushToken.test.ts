import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  registerDriverPushToken,
  revokeDriverPushToken,
  registerDriverPushTokenWithCapability,
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
        data: { pushToken: { id: '31200000-0000-4000-8000-000000000001', status: 'ACTIVE' } },
        error: null,
      }));
    };

    const result = await registerDriverPushToken('account-token', {
      appId: 'com.evnsolution.clever.driver',
      appVersion: '0.1.3',
      deviceId: 'android-device',
      devicePushToken: 'fcm-token',
      locale: 'ko-KR',
      platform: 'android',
      timezone: 'Asia/Seoul',
    });

    assert.deepEqual(result, { tokenId: '31200000-0000-4000-8000-000000000001' });
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


describe('Driver capability registration after each FCM registration', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = ORIGINAL_BASE_URL;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('uses the returned token ID and the same installation ID after token renewal', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const order: string[] = [];
    let ordinal = 0;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      order.push(`token:${body.devicePushToken}`);
      return new Response(JSON.stringify({ data: { pushToken: {
        id: `31200000-0000-4000-8000-00000000000${++ordinal}`, status: 'ACTIVE',
      } }, error: null }));
    };
    const registerCapability = async (_accessToken: string, input: {
      installationId: string; tokenId: string; schemaVersion: 1; kinds: readonly string[];
    }) => {
      order.push(`capability:${input.tokenId}`);
      assert.equal(input.installationId, 'android-device');
      assert.equal(input.schemaVersion, 1);
      assert.deepEqual(input.kinds, ['N01', 'N02', 'N03', 'N04', 'N05', 'N06']);
    };
    for (const devicePushToken of ['first-fcm', 'renewed-fcm']) {
      await registerDriverPushTokenWithCapability('account-token', {
        appId: 'com.evnsolution.clever.driver', deviceId: 'android-device', devicePushToken, platform: 'android',
      }, { operationalEnabled: true, registerCapability });
    }
    assert.deepEqual(order, [
      'token:first-fcm', 'capability:31200000-0000-4000-8000-000000000001',
      'token:renewed-fcm', 'capability:31200000-0000-4000-8000-000000000002',
    ]);
  });

  it('keeps capability disabled by default and refuses a missing installation ID', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { pushToken: {
      id: '31200000-0000-4000-8000-000000000001', status: 'ACTIVE',
    } }, error: null }));
    let capabilities = 0;
    const registerCapability = async () => { capabilities += 1; };
    const registration = { appId: 'com.evnsolution.clever.driver', devicePushToken: 'fcm', platform: 'android' as const };
    await registerDriverPushTokenWithCapability('token', registration, { operationalEnabled: false, registerCapability });
    assert.equal(capabilities, 0);
    await assert.rejects(registerDriverPushTokenWithCapability('token', registration,
      { operationalEnabled: true, registerCapability }), /DRIVER_PUSH_INSTALLATION_REQUIRED/);
    assert.equal(capabilities, 0);
  });

  it('rejects a malformed token registration before any capability is advertised', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    for (const pushToken of [{ id: 'symbolic-id', status: 'ACTIVE' }, { id: '31200000-0000-4000-8000-000000000001', status: 'REVOKED' }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ data: { pushToken }, error: null }));
      await assert.rejects(registerDriverPushToken('token', {
        appId: 'com.evnsolution.clever.driver', devicePushToken: 'fcm', platform: 'android',
      }), /DRIVER_PUSH_TOKEN_INVALID_RESPONSE/);
    }
  });
});
