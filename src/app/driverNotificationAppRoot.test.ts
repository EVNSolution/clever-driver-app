import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import type { DriverAuthSession } from '../api/dsvDriverAuth';
import { DriverOperationalApiError, type DriverNotificationResolution } from '../api/dsvDriverOperational';
import * as recoveryPolicy from '../auth/driverAuthRecovery';
import * as appUpdate from '../domain/appUpdate/driverAppUpdate';
import { createDriverNotificationRecovery } from '../domain/notifications/driverNotificationRecovery';
import * as payloads from '../domain/notifications/driverPushNotification';
import type { DriverPushRegistrationState } from '../platform/expo/notifications/expoDriverNotificationService';
import { resolveDriverNotificationClick } from './driverNotificationNavigation';

type Element = { type: unknown; props: Record<string, unknown> };
type WorkspaceProps = Parameters<typeof import('../ui/driver/DriverWorkspace')['DriverWorkspace']>[0];
const ID = '31200000-0000-4000-8000-000000000001';
const click: payloads.DriverNotificationClick = {
  notificationId: ID, kind: 'N06', schemaVersion: '1', expiresAt: '2099-10-07T01:00:00.000Z', status: 'current',
};
const destination: DriverNotificationResolution = {
  notificationId: ID,
  destination: { type: 'EXECUTION', executionContextId: '31200000-0000-4000-8000-000000000002', routePlanId: 'route-A', targetStopId: '31200000-0000-4000-8000-000000000003' },
};
function auth(accountId = 'account-A'): DriverAuthSession {
  return {
    account: { id: accountId, loginId: accountId, name: accountId, phone: '+821012345678', connectionStatus: 'LINKED', linkedDrivers: [] },
    accessToken: `${accountId}-access`, expiresAt: '2099-10-07T00:00:00.000Z', refreshToken: `${accountId}-refresh`,
    refreshTokenExpiresAt: '2099-11-07T00:00:00.000Z', tokenType: 'Bearer', ttlSeconds: 3600, use: 'dsv_driver_account',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    snapshot: () => [...values.values()],
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Executes production AppRoot effects/handlers and the real identity coordinator.
// Native layout, FCM delivery, and OS process launch still require device evidence.
export function appRootHarness(options: {
  storage?: ReturnType<typeof memoryStorage>;
  coldClick?: payloads.DriverNotificationClick;
  resolver?: (token: string, id: string) => Promise<DriverNotificationResolution>;
  refresh?: () => Promise<DriverAuthSession>;
  registration?: () => Promise<DriverPushRegistrationState>;
  acknowledge?: (token: string, id: string, kind: string) => Promise<void>;
  clearNativeResponse?: () => Promise<void>;
} = {}) {
  const storage = options.storage ?? memoryStorage();
  const coordinator = createDriverNotificationRecovery(storage);
  const slots: unknown[] = [];
  type Effect = { deps: unknown[]; cleanup?: void | (() => void) };
  const effects = new Map<number, Effect>();
  const pending: (() => void)[] = [];
  const timeouts = new Map<number, { delay: number; run(): void }>();
  const resolutions: { token: string; id: string }[] = [];
  const acknowledgements: { token: string; id: string; kind: string }[] = [];
  const savedSessions: DriverAuthSession[] = [];
  let cursor = 0;
  let dirty = false;
  let tree: unknown;
  let timeoutId = 0;
  let clearedNativeResponses = 0;
  let refreshRequests = 0;
  let lateWrites = 0;
  let active = true;
  let onClick: ((notification: payloads.DriverNotificationClick) => void) | undefined;
  let onReceipt: ((notification: payloads.DriverPushNotification) => void) | undefined;
  let onBack: (() => boolean) | undefined;
  let onActive: ((state: string) => void) | undefined;
  let authenticate: ((session: DriverAuthSession) => Promise<void>) | undefined;
  const same = (previous: unknown[] | undefined, next: unknown[]) => previous?.length === next.length && previous.every((value, i) => Object.is(value, next[i]));
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    react: {
      useRef: (initial: unknown) => { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (value: unknown) => {
          if (!active) lateWrites += 1;
          const next = typeof value === 'function' ? value(slots[index]) : value;
          if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
        }];
      },
      useCallback: (callback: unknown, deps: unknown[]) => {
        const index = cursor++;
        const old = slots[index] as { callback: unknown; deps: unknown[] } | undefined;
        if (!same(old?.deps, deps)) slots[index] = { callback, deps };
        return (slots[index] as { callback: unknown }).callback;
      },
      useEffect: (setup: () => void | (() => void), deps: unknown[]) => {
        const index = cursor++; const old = effects.get(index);
        if (!same(old?.deps, deps)) pending.push(() => { old?.cleanup?.(); effects.set(index, { deps, cleanup: setup() }); });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': {
      Platform: { OS: 'android' }, StyleSheet: { create: (styles: unknown) => styles },
      AppState: { currentState: 'active', addEventListener: (_name: string, callback: (state: string) => void) => {
        onActive = callback; return { remove: () => { onActive = undefined; } };
      } },
      BackHandler: { addEventListener: (_name: string, callback: () => boolean) => { onBack = callback; return { remove: () => { if (onBack === callback) onBack = undefined; } }; } },
      Alert: { alert: () => undefined }, Linking: { openURL: async () => undefined, openSettings: async () => undefined },
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
    },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' },
    'react-native-keyboard-controller': { KeyboardProvider: 'KeyboardProvider' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
    '../api/dsvDriverAppRelease': { fetchDriverAndroidAppRelease: async () => { throw new Error('Unexpected update request'); } },
    '../api/dsvDriverAuth': { refreshDriverAccountSession: async () => { refreshRequests += 1; return options.refresh?.() ?? auth(); } },
    '../auth/driverAuthRecovery': recoveryPolicy,
    '../auth/driverAuthSessionStore': {
      saveDriverAuthSession: async (session: DriverAuthSession) => { savedSessions.push(session); },
      readDriverAuthRefreshToken: async () => null, clearDriverAuthSession: async () => undefined,
    },
    '../config/driverAppInstall': { DRIVER_APP_INSTALL_PAGE_URL: 'https://example.test/install', isProductionDriverAndroidPackage: () => false },
    '../domain/appUpdate/driverAppUpdate': appUpdate,
    '../platform/expo/application/expoAppVersionService': { readInstalledDriverAppVersion: () => null },
    '../platform/expo/notifications/expoDriverNotificationService': {
      createExpoDriverNotificationRecovery: () => coordinator,
      registerExpoDriverPushNotifications: options.registration ?? (async () => ({ status: 'registered' })),
      subscribeToExpoDriverNotificationClicks: (callback: typeof onClick) => {
        onClick = callback;
        if (options.coldClick) callback?.(options.coldClick);
        return () => { onClick = undefined; };
      },
      subscribeToExpoDriverPushNotifications: (_token: string, callback: typeof onReceipt) => { onReceipt = callback; return () => { onReceipt = undefined; }; },
      revokeExpoDriverPushNotifications: async () => undefined,
      clearExpoDriverNotificationResponse: async () => { clearedNativeResponses += 1; await options.clearNativeResponse?.(); },
    },
    '../config/driverOperational': { DRIVER_OPERATIONAL_ENABLED: true },
    '../domain/notifications/driverPushNotification': payloads,
    '../ui/appUpdate/DriverAppUpdateScreen': { DriverAppUpdateScreen: 'DriverAppUpdateScreen' },
    '../ui/auth/AuthEntryScreen': { AuthEntryScreen: 'AuthEntryScreen' },
    '../ui/driver/DriverWorkspace': { DriverWorkspace: 'DriverWorkspace' },
    '../ui/driver/DriverOperationalInbox': { DriverOperationalInbox: 'Inbox', DriverNotificationNotice: 'Notice' },
    '../api/dsvDriverOperational': {
      DriverOperationalApiError,
      loadDriverOperationalInbox: async () => ({ items: [], nextCursor: null }),
      acknowledgeDriverOperationalNotification: async (token: string, id: string, kind: string) => { acknowledgements.push({ token, id, kind }); await options.acknowledge?.(token, id, kind); },
    },
    './driverNotificationNavigation': {
      resolveDriverNotificationClick: (notification: payloads.DriverNotificationClick, token: string) => resolveDriverNotificationClick(notification, token, async (accessToken, id) => {
        resolutions.push({ token: accessToken, id });
        return options.resolver?.(accessToken, id) ?? destination;
      }),
    },
  };
  const react = dependencies.react as { useEffect: unknown; useLayoutEffect?: unknown };
  react.useLayoutEffect = react.useEffect;
  const source = readFileSync(new URL('./AppRoot.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  runInNewContext(outputText, {
    module, exports: module.exports, Error, Date, Intl, Map, Set, Promise, process,
    setTimeout: (run: () => void, delay: number) => { const id = ++timeoutId; timeouts.set(id, { delay, run }); return id; },
    clearTimeout: (id: number) => { timeouts.delete(id); }, setInterval: () => ++timeoutId, clearInterval: () => undefined,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const component = (module.exports as typeof import('./AppRoot')).AppRoot;
  function nodes(value: unknown, result: Element[] = []): Element[] {
    if (Array.isArray(value)) value.forEach((child) => nodes(child, result));
    else if (value !== null && typeof value === 'object' && 'props' in value) {
      const element = value as Element; result.push(element); nodes(element.props.children, result);
    }
    return result;
  }
  function find(type: string) { return nodes(tree).find((element) => element.type === type); }
  function render() {
    cursor = 0; dirty = false; tree = component();
    pending.splice(0).forEach((effect) => effect());
    const entry = find('AuthEntryScreen');
    if (entry) authenticate = entry.props.onAuthenticated as typeof authenticate;
  }
  const harness = {
    render,
    async settle() { for (let i = 0; i < 12; i++) { await flush(); if (dirty) render(); } },
    async login(accountId = 'account-A') { assert.ok(authenticate); await authenticate(auth(accountId)); render(); await harness.settle(); },
    async logout() { const workspace = harness.workspace(); assert.ok(workspace); await workspace.onLogout(); render(); await harness.settle(); },
    workspace: () => find('DriverWorkspace')?.props as WorkspaceProps | undefined,
    find,
    hasText: (text: string) => nodes(tree).some((element) => element.type === 'Text' && element.props.children === text),
    click(notification = click) { assert.ok(onClick); onClick(notification); },
    hardwareBack() { assert.ok(onBack); return onBack(); },
    pressText(text: string) {
      const button = nodes(tree).find((element) => element.type === 'Pressable' && nodes(element.props.children).some((child) => child.type === 'Text' && child.props.children === text));
      assert.ok(button); (button.props.onPress as () => void)();
    },
    receive(notification = click as payloads.DriverPushNotification) { assert.ok(onReceipt); onReceipt(notification); },
    foreground() { assert.ok(onActive); onActive('active'); },
    fireAuthRefresh() {
      const entry = [...timeouts.entries()].find(([, timer]) => timer.delay === 2_147_000_000);
      assert.ok(entry); timeouts.delete(entry[0]); entry[1].run();
    },
    get resolutions() { return resolutions; },
    get acknowledgements() { return acknowledgements; },
    get refreshRequests() { return refreshRequests; },
    get savedSessions() { return savedSessions; },
    get clearedNativeResponses() { return clearedNativeResponses; },
    get lateWrites() { return lateWrites; },
    storage,
    unmount() { active = false; for (const effect of effects.values()) effect.cleanup?.(); },
  };
  return harness;
}

describe('Driver AppRoot synthetic click and authentication flow', () => {
  it('restores a cold click before login, resolves once, and sends OPENED only after workspace acceptance', async () => {
    const resolution = deferred<DriverNotificationResolution>();
    const h = appRootHarness({ coldClick: click, resolver: async () => resolution.promise });
    h.render(); await h.settle();
    assert.equal(h.resolutions.length, 0);
    assert.ok(h.find('AuthEntryScreen'));
    await h.login();
    assert.equal(h.resolutions.length, 1);
    assert.equal(h.acknowledgements.length, 0);
    h.click(); await h.settle();
    assert.equal(h.resolutions.length, 1);
    resolution.resolve(destination); await h.settle();
    const workspace = h.workspace(); assert.ok(workspace);
    assert.equal(workspace.notificationDestination?.targetStopId, '31200000-0000-4000-8000-000000000003');
    assert.equal(workspace.notificationDestination?.routePlanId, 'route-A');
    assert.equal(h.acknowledgements.length, 0);
    assert.match(h.storage.snapshot()[0]!, /pending.*N06/u);
    workspace.onNotificationDestinationAccepted?.(ID); await h.settle();
    assert.deepEqual(h.acknowledgements, [{ token: 'account-A-access', id: ID, kind: 'OPENED' }]);
    assert.equal(h.workspace()?.notificationDestination, undefined);
    assert.equal(h.clearedNativeResponses, 1);
    h.click(); await h.settle();
    assert.equal(h.resolutions.length, 1);
    h.unmount();
    const restarted = appRootHarness({ storage: h.storage, coldClick: click });
    restarted.render(); await restarted.settle(); await restarted.login();
    assert.equal(restarted.resolutions.length, 0);
    restarted.unmount();
  });

  it('suppresses an old resolver after account switch and keeps old route detail out of the new account', async () => {
    const resolution = deferred<DriverNotificationResolution>();
    const h = appRootHarness({ resolver: async () => resolution.promise });
    h.render(); await h.settle(); await h.login();
    h.click(); await h.settle();
    assert.equal(h.resolutions.length, 1);
    await h.login('account-B');
    resolution.resolve(destination); await h.settle();
    assert.equal(h.workspace()?.authSession.account.id, 'account-B');
    assert.equal(h.workspace()?.notificationDestination, undefined);
    assert.equal(h.acknowledgements.length, 0);
    assert.equal(h.clearedNativeResponses, 1);
    h.unmount();
  });

  it('keeps an offline unresolved click through restart and resolves it under the recovered account', async () => {
    const h = appRootHarness({ coldClick: click, resolver: async () => { throw new Error('offline'); } });
    h.render(); await h.settle(); await h.login();
    assert.ok(h.find('Notice')?.props.onRetry);
    assert.equal(h.acknowledgements.length, 0);
    h.unmount();
    const restarted = appRootHarness({ storage: h.storage });
    restarted.render(); await restarted.settle(); await restarted.login();
    assert.equal(restarted.resolutions.length, 1);
    assert.equal(restarted.workspace()?.notificationDestination?.targetStopId, '31200000-0000-4000-8000-000000000003');
    assert.equal(restarted.acknowledgements.length, 0);
    restarted.unmount();
  });

  it('does not restore a logged-out account when an automatic token refresh returns late', async () => {
    const refresh = deferred<DriverAuthSession>();
    const h = appRootHarness({ refresh: async () => refresh.promise });
    h.render(); await h.settle(); await h.login();
    h.fireAuthRefresh(); await h.settle();
    assert.equal(h.refreshRequests, 1);
    await h.logout();
    assert.ok(h.find('AuthEntryScreen'));
    await h.login('account-B');
    refresh.resolve(auth()); await h.settle();
    assert.equal(h.workspace()?.authSession.account.id, 'account-B');
    assert.deepEqual(h.savedSessions.map((session) => session.account.id), ['account-A', 'account-B']);
    h.unmount();
  });

  it('does not restore a logged-out account when click-triggered authentication recovery returns late', async () => {
    const refresh = deferred<DriverAuthSession>();
    const h = appRootHarness({ refresh: async () => refresh.promise, resolver: async () => { throw new DriverOperationalApiError(401, 'AUTH_REQUIRED'); } });
    h.render(); await h.settle(); await h.login();
    h.click(); await h.settle();
    assert.equal(h.refreshRequests, 1);
    await h.logout(); await h.login('account-B');
    refresh.resolve(auth()); await h.settle();
    assert.equal(h.workspace()?.authSession.account.id, 'account-B');
    assert.equal(h.workspace()?.notificationDestination, undefined);
    assert.equal(h.acknowledgements.length, 0);
    assert.deepEqual(h.savedSessions.map((session) => session.account.id), ['account-A', 'account-B']);
    h.unmount();
  });
});


it('does not show the previous account permission result after account switch', async () => {
  const first = deferred<DriverPushRegistrationState>();
  let registrations = 0;
  const h = appRootHarness({ registration: async () => ++registrations === 1 ? first.promise : { status: 'registered' } });
  h.render(); await h.settle(); await h.login();
  await h.login('account-B');
  first.resolve({ status: 'permission-denied', canAskAgain: false }); await h.settle();
  assert.equal(h.workspace()?.authSession.account.id, 'account-B');
  assert.equal(h.hasText('알림 권한이 꺼져 있습니다. 설정 열기'), false);
  h.unmount();
});

it('rechecks notification permission on foreground and removes the denial prompt after recovery', async () => {
  let permission: DriverPushRegistrationState = { status: 'permission-denied', canAskAgain: false };
  const h = appRootHarness({ registration: async () => permission });
  h.render(); await h.settle(); await h.login();
  assert.equal(h.hasText('알림 권한이 꺼져 있습니다. 설정 열기'), true);
  permission = { status: 'registered' };
  h.foreground(); h.render(); await h.settle();
  assert.equal(h.hasText('알림 권한이 꺼져 있습니다. 설정 열기'), false);
  h.unmount();
});

it('shows N03 release facts and acknowledges only after the notice is accepted', async () => {
  const released = { ...click, kind: 'N03' as const };
  const h = appRootHarness({ coldClick: released, resolver: async () => ({ notificationId: ID, destination: { type: 'ASSIGNMENT_RELEASED' } }) });
  h.render(); await h.settle(); await h.login();
  const notice = h.find('Notice'); assert.ok(notice);
  assert.equal(notice.props.message, '이 배차의 배정이 해제되었습니다.');
  assert.equal(h.workspace()?.notificationDestination, undefined);
  assert.equal(h.acknowledgements.length, 0);
  (notice.props.onClose as () => void)(); await h.settle();
  assert.deepEqual(h.acknowledgements, [{ token: 'account-A-access', id: ID, kind: 'OPENED' }]);
  h.unmount();
});

it('shows expired and unsupported clicks without resolver or acknowledgement requests', async () => {
  for (const notification of [
    { ...click, expiresAt: '2020-10-07T01:00:00.000Z', status: 'expired' as const },
    { kind: 'unsupported' as const, notificationId: 'provider-id', reason: 'UNSUPPORTED_PAYLOAD' as const },
  ]) {
    const h = appRootHarness({ coldClick: notification });
    h.render(); await h.settle(); await h.login();
    const notice = h.find('Notice'); assert.ok(notice);
    assert.equal(h.workspace()?.notificationDestination, undefined);
    assert.equal(h.resolutions.length, 0);
    (notice.props.onClose as () => void)(); await h.settle();
    assert.equal(h.acknowledgements.length, 0);
    h.unmount();
  }
});


it('recovers a resolver 401 and retries the same click with the renewed account token', async () => {
  let resolves = 0;
  const renewed = { ...auth(), accessToken: 'account-A-renewed-access' };
  const h = appRootHarness({
    refresh: async () => renewed,
    resolver: async () => { if (++resolves === 1) throw new DriverOperationalApiError(401, 'AUTH_REQUIRED'); return destination; },
  });
  h.render(); await h.settle(); await h.login();
  h.click(); await h.settle();
  assert.equal(h.refreshRequests, 1);
  assert.deepEqual(h.resolutions, [
    { token: 'account-A-access', id: ID }, { token: 'account-A-renewed-access', id: ID },
  ]);
  assert.equal(h.workspace()?.notificationDestination?.targetStopId, '31200000-0000-4000-8000-000000000003');
  assert.equal(h.acknowledgements.length, 0);
  await h.workspace()?.onNotificationDestinationAccepted?.(ID); await h.settle();
  assert.deepEqual(h.acknowledgements, [{ token: 'account-A-renewed-access', id: ID, kind: 'OPENED' }]);
  h.unmount();
});

it('retains a click when OPENED fails and accepts it after a revalidated destination retry', async () => {
  let attempts = 0;
  const h = appRootHarness({ acknowledge: async () => { if (++attempts === 1) throw new Error('acknowledgement response lost'); } });
  h.render(); await h.settle(); await h.login();
  h.click(); await h.settle();
  await h.workspace()?.onNotificationDestinationAccepted?.(ID); await h.settle();
  const notice = h.find('Notice'); assert.ok(notice);
  assert.ok(notice.props.onRetry);
  assert.equal(h.clearedNativeResponses, 0);
  assert.match(h.storage.snapshot()[0]!, /pending.*N06/u);
  (notice.props.onRetry as () => void)(); h.render(); await h.settle();
  assert.equal(h.resolutions.length, 2);
  assert.equal(h.workspace()?.notificationDestination?.notificationId, ID);
  await h.workspace()?.onNotificationDestinationAccepted?.(ID); await h.settle();
  assert.equal(attempts, 2);
  assert.equal(h.find('Notice'), undefined);
  assert.equal(h.clearedNativeResponses, 1);
  assert.equal(h.workspace()?.notificationDestination, undefined);
  h.click(); await h.settle();
  assert.equal(h.resolutions.length, 2);
  h.unmount();
});

it('shows a retry when persisting OPENED acceptance fails and does not strand the click lease', async () => {
  const base = memoryStorage();
  let fail = true;
  const storage = { ...base, setItem: async (key: string, value: string) => {
    if (fail && (JSON.parse(value) as { accepted: string[] }).accepted.length > 0) throw new Error('storage unavailable');
    await base.setItem(key, value);
  } };
  const h = appRootHarness({ storage });
  h.render(); await h.settle(); await h.login();
  h.click(); await h.settle();
  await h.workspace()?.onNotificationDestinationAccepted?.(ID); await h.settle();
  const notice = h.find('Notice'); assert.ok(notice);
  assert.ok(notice.props.onRetry);
  assert.equal(h.clearedNativeResponses, 0);
  assert.match(storage.snapshot()[0]!, /pending.*N06/u);
  fail = false;
  (notice.props.onRetry as () => void)(); h.render(); await h.settle();
  assert.equal(h.resolutions.length, 2);
  await h.workspace()?.onNotificationDestinationAccepted?.(ID); await h.settle();
  assert.equal(h.find('Notice'), undefined);
  assert.equal(h.clearedNativeResponses, 1);
  h.unmount();
});


it('keeps account-B destination while account-A N03 acknowledgement finishes late', async () => {
  const oldAck = deferred<void>();
  const idB = '31200000-0000-4000-8000-000000000003';
  const clickB = { ...click, notificationId: idB };
  const h = appRootHarness({
    coldClick: { ...click, kind: 'N03' },
    acknowledge: async (token) => { if (token === 'account-A-access') await oldAck.promise; },
    resolver: async (token, id) => token === 'account-A-access'
      ? { notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' } }
      : { notificationId: id, destination: { type: 'EXECUTION', executionContextId: 'context-B', routePlanId: 'route-B', targetStopId: '31200000-0000-4000-8000-000000000004' } },
  });
  h.render(); await h.settle(); await h.login();
  const notice = h.find('Notice'); assert.ok(notice);
  (notice.props.onClose as () => void)(); await h.settle();
  assert.equal(h.acknowledgements.length, 1);
  await h.login('account-B'); h.click(clickB); await h.settle();
  assert.equal(h.workspace()?.notificationDestination?.routePlanId, 'route-B');
  oldAck.resolve(); await h.settle();
  assert.equal(h.workspace()?.notificationDestination?.notificationId, idB);
  await h.workspace()?.onNotificationDestinationAccepted?.(idB); await h.settle();
  assert.equal(h.workspace()?.notificationDestination, undefined);
  assert.deepEqual(h.acknowledgements.map(({ token, id }) => ({ token, id })), [
    { token: 'account-A-access', id: ID }, { token: 'account-B-access', id: idB },
  ]);
  h.unmount();
});

it('does not restore account-A when its refresh completes after a manual account-B login', async () => {
  const oldRefresh = deferred<DriverAuthSession>();
  const h = appRootHarness({ refresh: async () => oldRefresh.promise });
  h.render(); await h.settle(); await h.login();
  h.fireAuthRefresh(); await h.settle();
  assert.equal(h.refreshRequests, 1);
  await h.login('account-B');
  oldRefresh.resolve(auth()); await h.settle();
  assert.equal(h.workspace()?.authSession.account.id, 'account-B');
  assert.deepEqual(h.savedSessions.map((session) => session.account.id), ['account-A', 'account-B']);
  h.unmount();
});

it('does not clear account-B destination when account-A native-response cleanup finishes late', async () => {
  const oldClear = deferred<void>();
  let clears = 0;
  const idB = '31200000-0000-4000-8000-000000000003';
  const h = appRootHarness({
    clearNativeResponse: async () => { if (++clears === 1) await oldClear.promise; },
    resolver: async (token, id) => ({ notificationId: id, destination: {
      type: 'EXECUTION', executionContextId: token === 'account-B-access' ? 'context-B' : 'context-A',
      routePlanId: token === 'account-B-access' ? 'route-B' : 'route-A', targetStopId: token === 'account-B-access' ? '31200000-0000-4000-8000-000000000004' : '31200000-0000-4000-8000-000000000003',
    } }),
  });
  h.render(); await h.settle(); await h.login(); h.click(); await h.settle();
  const oldAcceptance = h.workspace()?.onNotificationDestinationAccepted?.(ID);
  await h.settle(); assert.equal(clears, 1);
  await h.login('account-B'); h.click({ ...click, notificationId: idB }); await h.settle();
  assert.equal(h.workspace()?.notificationDestination?.routePlanId, 'route-B');
  oldClear.resolve(); await oldAcceptance; await h.settle();
  assert.equal(h.workspace()?.notificationDestination?.notificationId, idB);
  assert.equal(h.acknowledgements.length, 1);
  await h.workspace()?.onNotificationDestinationAccepted?.(idB); await h.settle();
  assert.equal(h.workspace()?.notificationDestination, undefined);
  assert.equal(h.acknowledgements.length, 2);
  h.unmount();
});

it('closes inbox and release notice with Android back while retaining the workspace', async () => {
  const h = appRootHarness({ resolver: async (_token, id) => ({ notificationId: id, destination: { type: 'ASSIGNMENT_RELEASED' } }) });
  h.render(); await h.settle(); await h.login();
  h.pressText('알림함'); h.render(); await h.settle();
  assert.ok(h.find('Inbox')); assert.ok(h.workspace());
  assert.equal(h.hardwareBack(), true); h.render(); await h.settle();
  assert.equal(h.find('Inbox'), undefined); assert.ok(h.workspace());
  h.click({ ...click, kind: 'N03' }); await h.settle();
  assert.ok(h.find('Notice'));
  assert.equal(h.hardwareBack(), true); await h.settle();
  assert.equal(h.find('Notice'), undefined); assert.ok(h.workspace());
  assert.equal(h.acknowledgements.length, 1);
  h.unmount();
});


it('refreshes only the inbox when an operational notification arrives in foreground', async () => {
  const h = appRootHarness(); h.render(); await h.settle(); await h.login();
  const before = h.workspace()?.refreshRequestKey;
  h.receive(); await h.settle();
  assert.equal(h.workspace()?.refreshRequestKey, before);
  assert.equal(h.resolutions.length, 0);
  assert.equal(h.acknowledgements.length, 0);
  h.unmount();
});

it('ends malformed N06 and unsupported UUID clicks without OPENED or restart retries', async () => {
  for (const malformed of [true, false]) {
    const notification = malformed ? click : payloads.classifyDriverNotificationClick('provider-invalid-uuid', {
      kind: 'N06', schemaVersion: '1', notificationId: '00000000-0000-0000-0000-000000000000', expiresAt: click.expiresAt,
    });
    const h = appRootHarness({ coldClick: notification, resolver: async () => ({
      ...destination, destination: { type: 'EXECUTION', executionContextId: destination.destination.type === 'EXECUTION' ? destination.destination.executionContextId : '', routePlanId: 'route-A' },
    }) });
    h.render(); await h.settle(); await h.login();
    const notice = h.find('Notice'); assert.ok(notice);
    assert.equal(h.workspace()?.notificationDestination, undefined);
    assert.equal(notice.props.onRetry, undefined);
    (notice.props.onClose as () => void)(); await h.settle();
    assert.equal(h.acknowledgements.length, 0);
    assert.equal(JSON.parse(h.storage.snapshot()[0]!).pending.length, 0);
    h.unmount();
    const restarted = appRootHarness({ storage: h.storage });
    restarted.render(); await restarted.settle(); await restarted.login();
    assert.equal(restarted.resolutions.length, 0);
    assert.equal(restarted.find('Notice'), undefined);
    restarted.unmount();
  }
});

it('keeps legacy clicks pending until the refreshed destination is visible', async () => {
  for (const kind of ['route_changed', 'bundle_handoff'] as const) {
    const h = appRootHarness(); h.render(); await h.settle(); await h.login();
    h.click(kind === 'route_changed' ? { kind, notificationId: `provider-${kind}` } : { kind, notificationId: `provider-${kind}`, handoffRequestId: 'handoff-A' }); await h.settle();
    assert.equal(h.resolutions.length, 0);
    assert.equal(h.acknowledgements.length, 0);
    assert.equal(h.workspace()?.notificationRefreshId, `provider-${kind}`);
    assert.equal(JSON.parse(h.storage.snapshot()[0]!).pending.length, 1);
    h.pressText('알림함'); await h.settle();
    await h.workspace()?.onNotificationDestinationAccepted?.(`provider-${kind}`); await h.settle();
    assert.equal(JSON.parse(h.storage.snapshot()[0]!).pending.length, 1);
    (h.find('Inbox')!.props.onClose as () => void)(); await h.settle();
    await h.workspace()?.onNotificationDestinationAccepted?.(`provider-${kind}`); await h.settle();
    assert.equal(JSON.parse(h.storage.snapshot()[0]!).pending.length, 0);
    assert.equal(h.acknowledgements.length, 0);
    assert.equal(h.clearedNativeResponses, 1);
    h.unmount();
  }
});
