import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import { registerDriverPushTokenWithCapability, revokeDriverPushToken } from '../../../api/dsvDriverPushToken';
import { createDriverNotificationRecovery } from '../../../domain/notifications/driverNotificationRecovery';
import * as notifications from '../../../domain/notifications/driverPushNotification';

type Service = typeof import('./expoDriverNotificationService');
const ORIGINAL_FETCH = globalThis.fetch;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

// Executes the production Expo adapter with native listeners and storage replaced by synthetic interfaces.
function nativeServiceHarness() {
  const stored = new Map<string, string>();
  const receipts = new Set<(event: unknown) => void>();
  const tokenListeners = new Set<(token: { data: string }) => void>();
  const capabilities: { accessToken: string; tokenId: string; installationId: string }[] = [];
  let token = 'fcm-A';
  const storage = {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: string) => { stored.set(key, value); },
    removeItem: async (key: string) => { stored.delete(key); },
  };
  const dependencies: Record<string, unknown> = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'expo-application': {
      applicationId: 'com.evnsolution.clever.driver', nativeApplicationVersion: '0.1.3', getAndroidId: () => 'installation-A',
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-notifications': {
      AndroidImportance: { HIGH: 4 },
      setNotificationChannelAsync: async () => undefined,
      getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      getDevicePushTokenAsync: async () => ({ data: token }),
      addNotificationReceivedListener: (callback: (event: unknown) => void) => { receipts.add(callback); return { remove: () => receipts.delete(callback) }; },
      addPushTokenListener: (callback: (next: { data: string }) => void) => { tokenListeners.add(callback); return { remove: () => tokenListeners.delete(callback) }; },
      setNotificationHandler: () => undefined,
      clearLastNotificationResponseAsync: async () => undefined,
    },
    '../../../api/dsvDriverOperational': {
      registerDriverOperationalCapability: async (accessToken: string, input: { tokenId: string; installationId: string }) => { capabilities.push({ accessToken, ...input }); },
    },
    '../../../api/dsvDriverPushToken': { registerDriverPushTokenWithCapability, revokeDriverPushToken },
    '../../../config/driverOperational': { DRIVER_OPERATIONAL_ENABLED: true },
    '../../../domain/notifications/driverPushNotification': notifications,
    '../../../domain/notifications/driverNotificationRecovery': { createDriverNotificationRecovery },
  };
  const source = readFileSync(new URL('./expoDriverNotificationService.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, Date, Intl, Promise,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  return {
    service: module.exports as Service,
    token: (value: string) => { token = value; },
    renewedToken: (value: string) => { token = value; tokenListeners.forEach((callback) => callback({ data: value })); },
    storedToken: () => stored.get('driver.push.device-token'),
    receipt: () => receipts.forEach((callback) => callback({ request: { identifier: 'provider-id', content: { data: { type: 'driver_route_changed', routePlanId: 'route-A' } } } })),
    capabilities,
  };
}

describe('Production Expo push ownership and revocation ordering', () => {
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

  it('ignores a late account-A revoke after account-B registration and retains B receipt and renewal capability', async () => {
    const calls: { method: string; token: string; account: string | null }[] = [];
    let registration = 0;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      calls.push({ method: init?.method ?? '', token: body.devicePushToken, account: (init?.headers as Headers).get('Authorization') });
      return new Response(JSON.stringify({ data: { pushToken: { id: `31200000-0000-4000-8000-${String(++registration).padStart(12, '0')}`, status: 'ACTIVE' } }, error: null }));
    };
    const h = nativeServiceHarness();
    const stopA = h.service.subscribeToExpoDriverPushNotifications('access-A', () => undefined);
    await h.service.registerExpoDriverPushNotifications('access-A'); stopA();
    h.token('fcm-B');
    let receivedB = 0;
    const stopB = h.service.subscribeToExpoDriverPushNotifications('access-B', () => { receivedB += 1; });
    await h.service.registerExpoDriverPushNotifications('access-B');
    await h.service.revokeExpoDriverPushNotifications('access-A');
    h.receipt();
    assert.equal(receivedB, 1);
    assert.equal(h.storedToken(), 'fcm-B');
    assert.equal(calls.filter(({ method }) => method === 'DELETE').length, 0);
    h.renewedToken('fcm-B-renewed'); await flush(); await flush();
    assert.equal(h.storedToken(), 'fcm-B-renewed');
    assert.equal(h.capabilities.at(-1)?.accessToken, 'access-B');
    assert.equal(h.capabilities.at(-1)?.installationId, 'installation-A');
    stopB();
  });

  it('finishes A revocation before registering B and never removes B token storage', async () => {
    const deletion = deferred<Response>();
    const order: string[] = [];
    let registration = 0;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      order.push(`${init?.method}:${body.devicePushToken}`);
      if (init?.method === 'DELETE') return deletion.promise;
      return new Response(JSON.stringify({ data: { pushToken: { id: `31200000-0000-4000-8000-${String(++registration).padStart(12, '0')}`, status: 'ACTIVE' } }, error: null }));
    };
    const h = nativeServiceHarness();
    const stopA = h.service.subscribeToExpoDriverPushNotifications('access-A', () => undefined);
    await h.service.registerExpoDriverPushNotifications('access-A');
    const revocation = h.service.revokeExpoDriverPushNotifications('access-A');
    stopA(); h.token('fcm-B');
    let receipts = 0;
    const stopB = h.service.subscribeToExpoDriverPushNotifications('access-B', () => { receipts += 1; });
    const registerB = h.service.registerExpoDriverPushNotifications('access-B');
    await flush();
    assert.deepEqual(order, ['PUT:fcm-A', 'DELETE:fcm-A']);
    deletion.resolve(new Response(JSON.stringify({ data: { revoked: true }, error: null })));
    await revocation; await registerB;
    assert.deepEqual(order, ['PUT:fcm-A', 'DELETE:fcm-A', 'PUT:fcm-B']);
    assert.equal(h.storedToken(), 'fcm-B');
    h.receipt(); assert.equal(receipts, 1);
    stopB();
  });

  it('does not revoke the renewed access-token registration with the previous access token', async () => {
    let deletes = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'DELETE') deletes += 1;
      return new Response(JSON.stringify({ data: { pushToken: { id: '31200000-0000-4000-8000-000000000001', status: 'ACTIVE' } }, error: null }));
    };
    const h = nativeServiceHarness();
    const stopOld = h.service.subscribeToExpoDriverPushNotifications('access-A', () => undefined);
    await h.service.registerExpoDriverPushNotifications('access-A'); stopOld();
    const stopRenewed = h.service.subscribeToExpoDriverPushNotifications('access-A-renewed', () => undefined);
    await h.service.registerExpoDriverPushNotifications('access-A-renewed');
    await h.service.revokeExpoDriverPushNotifications('access-A');
    assert.equal(deletes, 0);
    assert.equal(h.storedToken(), 'fcm-A');
    stopRenewed();
  });
});
