import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import type { DriverAuthSession } from '../api/dsvDriverAuth';
import * as events from '../api/dsvDriverEvents';
import type { DriverDeliveryRoute } from '../api/dsvDriverRoute';
import * as plan from '../domain/delivery/deliveryPlan';
import * as commandQueue from '../domain/delivery/driverCommandQueue';
import { DriverOperationalApiError, type DriverExecutionContext } from '../api/dsvDriverOperational';

type Props = Parameters<typeof import('../ui/driver/DriverWorkspace')['DriverWorkspace']>[0];
type Element = { type: unknown; props: Record<string, unknown> };
type Execution = Parameters<typeof import('../ui/driver/DeliveryExecutionActions')['useDeliveryExecution']>[0];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
const session: DriverAuthSession = {
  account: { id: '77777777-7777-4777-8777-777777777777', loginId: 'driver', name: 'Driver', phone: '+821012345678', connectionStatus: 'LINKED', linkedDrivers: [] },
  accessToken: 'account-token', expiresAt: '2026-10-07T10:00:00Z', refreshToken: 'refresh',
  refreshTokenExpiresAt: '2026-11-07T10:00:00Z', tokenType: 'Bearer', ttlSeconds: 3600, use: 'dsv_driver_account',
};
const route: DriverDeliveryRoute = {
  availableRoutes: [], deliveryDate: '2026-10-07', depotCoordinate: null, destinationNotesById: {},
  etaStatus: 'READY', executionStatus: 'IN_PROGRESS', nextDeliveryStopId: null,
  orders: [{ ...plan.PREVIEW_DELIVERY_ORDERS[0]!, id: 'target-stop', status: 'DELIVERED' }],
  pickupCompletedAt: '2026-10-07T00:00:00Z', routeAccessToken: 'route-token', routeContext: 'route-A',
  routeId: 'route-A', routeName: 'Route A', routePlanId: 'route-A', routeVersionId: 'child-A', serverRouteGeometry: null, timezone: 'Asia/Seoul',
};

// Execute production effects and handlers. Native layout and FCM require separate device evidence.
export function workspaceHarness(overrides: {
  loadedRoute?: DriverDeliveryRoute;
  routeApi?: Record<string, unknown>;
  operationalApi?: Record<string, unknown>;
  commands?: unknown;
  storedCommands?: { current: commandQueue.DriverQueuedCommand[] };
  storage?: Map<string, string>;
} = {}) {
  const slots: unknown[] = [];
  type Effect = { deps: unknown[]; cleanup?: void | (() => void) };
  const effects = new Map<number, Effect>();
  const pending: (() => void)[] = [];
  let index = 0;
  let dirty = false;
  let active = true;
  let execution!: Execution;
  let tree: unknown;
  let lateWrites = 0;
  let uuidCounter = 0;
  const storage = overrides.storage ?? new Map<string, string>();
  const storedCommands = overrides.storedCommands ?? { current: [] };
  const loadedRoute = overrides.loadedRoute ?? route;
  const choice = { deliveryDate: loadedRoute.deliveryDate, executionStatus: loadedRoute.executionStatus,
    routeAccessToken: loadedRoute.routeAccessToken, routeContext: loadedRoute.routeContext,
    routeName: loadedRoute.routeName, routePlanId: loadedRoute.routePlanId };
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    react: {
      useRef: (initial: unknown) => { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
      useState: (initial: unknown) => {
        const i = index++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], (value: unknown) => { if (!active) lateWrites += 1;
          const next = typeof value === 'function' ? value(slots[i]) : value;
          if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
        }];
      },
      useEffect: (setup: () => void | (() => void), deps: unknown[]) => {
        const i = index++; const old = effects.get(i);
        if (!same(old?.deps, deps)) pending.push(() => { old?.cleanup?.(); effects.set(i, { deps, cleanup: setup() }); });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: (styles: unknown) => styles },
      View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-symbols': {},
    'expo-modules-core': { uuid: { v4: () => `11111111-1111-4111-8111-${String(++uuidCounter).padStart(12, '0')}` } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
      removeItem: async (key: string) => { storage.delete(key); },
    } },
    '../../api/dsvDriverEvents': events,
    '../../api/dsvDriverProofMedia': {},
    '../../api/dsvDriverRoute': {
      DriverRouteApiError: class extends Error {}, loadDriverDeliveryRouteChoices: async () => [choice],
      loadDriverCompletedRouteHistory: async () => [], loadDriverDeliveryRoute: async () => loadedRoute,
      ...overrides.routeApi,
    },
    '../../api/dsvDriverOperational': { DriverOperationalApiError, DRIVER_OPERATIONAL_ENABLED: false, ...overrides.operationalApi },
    '../../config/driverOperational': { DRIVER_OPERATIONAL_ENABLED: overrides.operationalApi?.DRIVER_OPERATIONAL_ENABLED ?? false },
    '../../domain/delivery/deliveryPlan': plan,
    '../../domain/navigation/androidBackNavigation': {},
    '../../domain/delivery/driverCommandQueue': overrides.commands ?? commandQueue,
    '../../platform/expo/storage/driverCommandStore': { createDriverCommandStore: () => ({
      load: async () => storedCommands.current,
      save: async (commands: commandQueue.DriverQueuedCommand[]) => { storedCommands.current = commands; },
    }) },
    './DeliveryScreen': { DeliveryScreen: 'DeliveryScreen' },
    './DeliveryMapScreen': { DeliveryMapScreen: 'DeliveryMapScreen' },
    './DriverDeliveryException': { DriverDeliveryException: 'DriverDeliveryException' },
    './AppDialog': { useAppDialog: () => ({ dialog: null, showDialog: () => undefined }) },
    './DeliveryExecutionActions': { DeliveryExecutionOverlay: 'Overlay', useDeliveryExecution: (options: Execution) => {
      execution = options; return { isLocked: false };
    } },
    './DriverRefreshControl': {}, './DriverSettingsModal': {}, './DeliverySpaceScreen': {},
  };
  const source = readFileSync(new URL('../ui/driver/DriverWorkspace.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, Error, Date, Intl, Map, Set, Promise, process,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } });
  const component = (module.exports as typeof import('../ui/driver/DriverWorkspace')).DriverWorkspace;
  let props: Props = { authSession: session, onLogout: () => undefined, refreshRequestKey: 0 };
  function render(next: Partial<Props> = {}) {
    props = { ...props, ...next }; index = 0; dirty = false; tree = component(props);
    pending.splice(0).forEach((effect) => effect()); return tree;
  }
  function nodes(value: unknown, result: Element[] = []): Element[] {
    if (Array.isArray(value)) value.forEach((child) => nodes(child, result));
    else if (value !== null && typeof value === 'object' && 'props' in value) {
      const element = value as Element; result.push(element); nodes(element.props.children, result);
    }
    return result;
  }
  return {
    render,
    async settle() { for (let i = 0; i < 8; i++) { await flush(); if (dirty) render(); } },
    find(predicate: (element: Element) => boolean) { return nodes(tree).find(predicate); },
    select(id = loadedRoute.routePlanId) { const selector = nodes(tree).find((element) => 'onSelect' in element.props);
      assert.ok(selector); (selector.props.onSelect as (id: string) => void)(id); render(); },
    get execution() { return execution; },
    get lateWrites() { return lateWrites; },
    unmount() { active = false; for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

describe('Driver workspace read and explicit command boundaries', () => {
  it('sends zero business POSTs during list, detail, refresh and tab navigation with terminal stops', async () => {
    const requests: RequestInit[] = [];
    globalThis.fetch = async (_url, init) => { requests.push(init ?? {}); return new Response(JSON.stringify({ data: { eventId: 'event' } })); };
    const h = workspaceHarness(); h.render(); await h.settle(); h.select(); await h.settle();
    assert.equal(h.execution.summary, null);
    const screen = h.find((element) => element.type === 'DeliveryScreen'); assert.ok(screen);
    (screen.props.onRefresh as () => void)(); h.render(); await h.settle();
    const map = h.find((element) => element.props.label === '지도'); assert.ok(map);
    (map.props.onPress as () => void)(); h.render(); await h.settle();
    assert.equal(requests.filter(({ method }) => method === 'POST').length, 0);
    h.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('offers explicit completion recovery and reuses the original event identity after response loss', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init?.body as string));
      if (bodies.length === 1) throw new Error('response lost');
      return new Response(JSON.stringify({ data: { eventId: 'event' } }));
    };
    const h = workspaceHarness(); h.render(); await h.settle(); h.select(); await h.settle();
    const button = h.find((element) => element.props.accessibilityLabel === '배차 완료 복구'); assert.ok(button);
    await assert.rejects(h.execution.onCompleteRoute(), /response lost/u);
    await h.execution.onCompleteRoute(); h.render(); await h.settle();
    assert.equal(bodies.length, 2); assert.equal(bodies[0]!.eventType, 'ROUTE_COMPLETED');
    assert.equal(bodies[0]!.clientEventId, bodies[1]!.clientEventId);
    assert.equal(bodies[0]!.occurredAt, bodies[1]!.occurredAt);
    h.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('restores explicit completion identity after restart without sending completion from reads', async () => {
    const storage = new Map<string, string>();
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init?.body as string));
      if (bodies.length === 1) throw new Error('response lost');
      return new Response(JSON.stringify({ data: { eventId: 'event' } }));
    };
    const initial = workspaceHarness({ storage }); initial.render(); await initial.settle(); initial.select(); await initial.settle();
    await assert.rejects(initial.execution.onCompleteRoute()); initial.unmount();
    const restarted = workspaceHarness({ storage }); restarted.render(); await restarted.settle(); restarted.select(); await restarted.settle();
    assert.equal(bodies.length, 1);
    await restarted.execution.onCompleteRoute();
    assert.deepEqual(bodies[0], bodies[1]); assert.equal(storage.size, 0);
    restarted.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });
});

const operationalRoute: DriverDeliveryRoute = {
  ...route, routePlanId: '22222222-2222-4222-8222-222222222222', routeId: '22222222-2222-4222-8222-222222222222',
  routeVersionId: '33333333-3333-4333-8333-333333333333', executionStatus: 'READY', etaStatus: 'PRE_PICKUP', pickupCompletedAt: null,
  nextDeliveryStopId: '44444444-4444-4444-8444-444444444444',
  orders: [
    { ...route.orders[0]!, id: '44444444-4444-4444-8444-444444444444', status: 'PENDING', destinationId: 'first', destinationName: 'Server next stop' },
    { ...route.orders[0]!, id: '55555555-5555-4555-8555-555555555555', status: 'PENDING', destinationId: 'target', destinationName: 'Notification target' },
  ],
};
const context: DriverExecutionContext = {
  executionContextId: '66666666-6666-4666-8666-666666666666', routePlanId: operationalRoute.routePlanId,
  routeVersion: 1, assignmentEpoch: '1', assignmentGeneration: '1', expectedRouteVersionId: operationalRoute.routeVersionId!,
  serviceDate: operationalRoute.deliveryDate, status: 'ACTIVE', startedAt: null,
};

describe('Driver workspace operational commands and exact notification target', () => {
  it('opens the N06 target deliveryStopId instead of the server next stop, and retains it after OPENED consumption', async () => {
    let accepted = 0; let rejected = 0; let posts = 0;
    globalThis.fetch = async () => { posts += 1; throw new Error('Unexpected business request'); };
    const h = workspaceHarness({ loadedRoute: operationalRoute, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
    } });
    h.render({ notificationDestination: { notificationId: 'notification', executionContextId: context.executionContextId,
      routePlanId: context.routePlanId, targetStopId: operationalRoute.orders[1]!.id },
      onNotificationDestinationAccepted: () => { accepted += 1; }, onNotificationDestinationRejected: () => { rejected += 1; } });
    await h.settle();
    assert.equal(accepted, 1); assert.equal(rejected, 0);
    assert.equal(h.execution.summary?.deliveryStopId, operationalRoute.orders[1]!.id);
    h.render({ notificationDestination: undefined }); await h.settle();
    assert.equal(h.execution.summary?.destinationName, 'Notification target');
    assert.equal(h.find((element) => element.type === 'DeliveryScreen')?.props.nextDeliveryStopId, operationalRoute.orders[1]!.id);
    assert.equal(posts, 0); h.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('rejects completed or absent N06 targets and mismatched child fences without opening another stop', async () => {
    for (const targetStopId of ['missing', operationalRoute.orders[0]!.id]) {
      let accepted = 0; let rejected = 0;
      const h = workspaceHarness({ loadedRoute: { ...operationalRoute, orders: operationalRoute.orders.map((order, index) =>
        index === 0 ? { ...order, status: 'DELIVERED' } : order) }, operationalApi: {
        DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
      } });
      h.render({ notificationDestination: { notificationId: targetStopId, executionContextId: context.executionContextId,
        routePlanId: context.routePlanId, targetStopId }, onNotificationDestinationAccepted: () => { accepted += 1; },
        onNotificationDestinationRejected: () => { rejected += 1; } }); await h.settle();
      assert.equal(accepted, 0); assert.ok(rejected > 0);
      assert.equal(h.find((element) => element.type === 'DeliveryScreen'), undefined); h.unmount();
    }
  });

  it('waits for server ACK after a lost atomic start response and never falls back to legacy POSTs', async () => {
    const payloads: commandQueue.DriverCommandPayload[] = []; let legacyPosts = 0;
    const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
    globalThis.fetch = async () => { legacyPosts += 1; throw new Error('Legacy fallback'); };
    const h = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
      startDriverExecution: async (_token: string, id: string, payload: commandQueue.DriverCommandPayload) => {
        payloads.push(payload); if (payloads.length === 1) throw new Error('response lost');
        return { ...payload, executionContextId: id };
      },
    } });
    h.render(); await h.settle(); h.select(); await h.settle();
    await assert.rejects(h.execution.onStartDelivery(), /서버 승인/u); h.render(); await h.settle();
    assert.equal(stored.current[0]?.status, 'pending');
    await h.execution.onStartDelivery(); h.render(); await h.settle();
    assert.equal(stored.current[0]?.status, 'confirmed'); assert.equal(payloads.length, 2);
    assert.equal(payloads[0]!.commandId, payloads[1]!.commandId); assert.equal(payloads[0]!.occurredAt, payloads[1]!.occurredAt);
    assert.equal(legacyPosts, 0); h.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('reports an injected reason to the exact stop without any completion event', async () => {
    const reports: (commandQueue.DriverCommandPayload & commandQueue.DriverDeliveryExceptionDetails)[] = [];
    let legacyPosts = 0;
    globalThis.fetch = async () => { legacyPosts += 1; throw new Error('Unexpected event'); };
    const h = workspaceHarness({ loadedRoute: operationalRoute, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
      reportDriverDeliveryException: async (_token: string, id: string,
        payload: commandQueue.DriverCommandPayload & commandQueue.DriverDeliveryExceptionDetails) => {
        reports.push(payload); return { ...payload, executionContextId: id };
      },
    } });
    h.render({ deliveryExceptionReasons: [{ code: 'SYNTHETIC_ONLY', label: '합성 사유', requiresExplanation: true }] });
    await h.settle(); h.select(); await h.settle();
    const form = h.find((element) => element.type === 'DriverDeliveryException'); assert.ok(form);
    const submit = form.props.onSubmit as (reason: string, explanation?: string) => Promise<void>;
    await assert.rejects(submit('SYNTHETIC_ONLY'), /필수/u);
    await submit('SYNTHETIC_ONLY', '합성 흐름 확인');
    assert.equal(reports.length, 1); assert.equal(reports[0]!.targetStopId, operationalRoute.nextDeliveryStopId);
    assert.equal(legacyPosts, 0); h.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('replays an offline user start after app restart with the same identity, even when the server already started it', async () => {
    const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
    const storage = new Map<string, string>();
    const payloads: commandQueue.DriverCommandPayload[] = [];
    const initial = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, storage, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
      startDriverExecution: async (_token: string, _id: string, payload: commandQueue.DriverCommandPayload) => {
        payloads.push(payload); throw new Error('offline after server commit');
      },
    } });
    initial.render(); await initial.settle(); initial.select(); await initial.settle();
    await assert.rejects(initial.execution.onStartDelivery(), /서버 승인/u); initial.unmount(); await flush();
    assert.equal(stored.current[0]?.status, 'pending');
    const restarted = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, storage, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [{ ...context, startedAt: '2026-10-07T01:00:00.000Z' }],
      startDriverExecution: async (_token: string, id: string, payload: commandQueue.DriverCommandPayload) => {
        payloads.push(payload); return { ...payload, executionContextId: id };
      },
    } });
    restarted.render(); await restarted.settle();
    assert.equal(stored.current[0]?.status, 'confirmed'); assert.equal(payloads.length, 2);
    assert.equal(payloads[0]!.commandId, payloads[1]!.commandId); assert.equal(payloads[0]!.occurredAt, payloads[1]!.occurredAt);
    assert.equal(initial.lateWrites, 0); restarted.unmount();
  });

  it('never uses legacy start after the atomic route disappears on restart', async () => {
    const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
    const storage = new Map<string, string>(); let legacy = 0;
    globalThis.fetch = async () => { legacy += 1; throw new Error('Forbidden fallback'); };
    const first = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, storage, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
      startDriverExecution: async () => { throw new Error('lost response'); },
    } });
    first.render(); await first.settle(); first.select(); await first.settle();
    await assert.rejects(first.execution.onStartDelivery()); first.unmount();
    const restarted = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, storage, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [],
    } });
    restarted.render(); await restarted.settle(); restarted.select(); await restarted.settle();
    await assert.rejects(restarted.execution.onStartDelivery(), /기존 시작 명령/u);
    assert.equal(legacy, 0); restarted.unmount(); delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('revalidates a consumed N06 target after refresh and prevents completion of another stop', async () => {
    let current = operationalRoute;
    const h = workspaceHarness({ loadedRoute: operationalRoute, routeApi: { loadDriverDeliveryRoute: async () => current }, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context],
    } });
    h.render({ notificationDestination: { notificationId: 'notification', executionContextId: context.executionContextId,
      routePlanId: context.routePlanId, targetStopId: operationalRoute.orders[1]!.id } }); await h.settle();
    h.render({ notificationDestination: undefined }); await h.settle();
    current = { ...operationalRoute, orders: operationalRoute.orders.map((order, i) => i === 1 ? { ...order, status: 'DELIVERED' } : order) };
    const refresh = h.find((element) => element.type === 'DeliveryScreen')?.props.onRefresh as () => void;
    refresh(); h.render(); await h.settle();
    assert.equal(h.find((element) => element.type === 'DeliveryScreen'), undefined);
    assert.equal(h.execution.summary, null); h.unmount();
  });

  it('persists an offline start and report before fresh authority lookup, then retries the original fences after restart', async () => {
    for (const kind of ['START_EXECUTION', 'REPORT_DELIVERY_EXCEPTION'] as const) {
      let offline = false; let sends = 0;
      const storage = new Map<string, string>(); const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
      const h = workspaceHarness({ loadedRoute: operationalRoute, storage, storedCommands: stored, operationalApi: {
        DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => { if (offline) throw new Error('offline'); return [context]; },
        startDriverExecution: async () => { sends += 1; throw new Error('must not send offline'); },
        reportDriverDeliveryException: async () => { sends += 1; throw new Error('must not send offline'); },
      } });
      h.render({ deliveryExceptionReasons: [{ code: 'SYNTHETIC_ONLY', label: '합성 사유' }] }); await h.settle(); h.select(); await h.settle();
      offline = true;
      if (kind === 'START_EXECUTION') await assert.rejects(h.execution.onStartDelivery(), /서버 승인/u);
      else {
        const form = h.find((element) => element.type === 'DriverDeliveryException'); assert.ok(form);
        await assert.rejects((form.props.onSubmit as (code: string) => Promise<void>)('SYNTHETIC_ONLY'), /서버 승인/u);
      }
      assert.equal(stored.current.length, 1); assert.equal(stored.current[0]!.type, kind);
      assert.equal(stored.current[0]!.status, 'pending'); assert.equal(sends, 0);
      const original = { ...stored.current[0]!.payload }; h.unmount();
      const replayed: commandQueue.DriverQueuedCommand['payload'][] = [];
      const send = async (_token: string, id: string, payload: commandQueue.DriverQueuedCommand['payload']) => {
        replayed.push(payload); return { ...payload, executionContextId: id };
      };
      const restarted = workspaceHarness({ loadedRoute: operationalRoute, storage, storedCommands: stored, operationalApi: {
        DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context], startDriverExecution: send, reportDriverDeliveryException: send,
      } }); restarted.render(); await restarted.settle();
      assert.equal(stored.current[0]!.status, 'confirmed'); assert.deepEqual(replayed[0], original);
      restarted.unmount();
    }
  });

  it('blocks reassignment before sending the cached user command, rather than upgrading its epoch', async () => {
    let changed = false; let sends = 0;
    const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
    const h = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [changed ? { ...context, assignmentEpoch: '2' } : context],
      startDriverExecution: async () => { sends += 1; throw new Error('wrong epoch'); },
    } }); h.render(); await h.settle(); h.select(); await h.settle(); changed = true;
    await assert.rejects(h.execution.onStartDelivery(), /차단/u);
    assert.equal(sends, 0); assert.equal(stored.current[0]?.payload.assignmentEpoch, '1');
    assert.equal(stored.current[0]?.status, 'blocked'); h.unmount();
  });

  it('recovers authentication and retries a saved command after token refresh without changing its identity', async () => {
    let expired = false; let recoveries = 0;
    const stored = { current: [] as commandQueue.DriverQueuedCommand[] };
    const sends: { token: string; payload: commandQueue.DriverCommandPayload }[] = [];
    const h = workspaceHarness({ loadedRoute: operationalRoute, storedCommands: stored, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async (token: string) => {
        if (expired && token === session.accessToken) throw { status: 401, code: 'TOKEN_EXPIRED' };
        return [context];
      },
      startDriverExecution: async (token: string, id: string, payload: commandQueue.DriverCommandPayload) => {
        sends.push({ token, payload }); return { ...payload, executionContextId: id };
      },
    } }); h.render({ onAuthenticationRequired: () => { recoveries += 1; } }); await h.settle(); h.select(); await h.settle();
    expired = true; await assert.rejects(h.execution.onStartDelivery(), /서버 승인/u);
    assert.equal(recoveries, 1); assert.equal(stored.current[0]?.status, 'pending');
    const original = { ...stored.current[0]!.payload };
    h.render({ authSession: { ...session, accessToken: 'refreshed-token' } }); await h.settle();
    assert.equal(stored.current[0]?.status, 'confirmed'); assert.equal(sends.length, 1);
    assert.equal(sends[0]!.token, 'refreshed-token'); assert.deepEqual(sends[0]!.payload, original); h.unmount();
  });

  it('keeps the newer notification route when an older GET finishes late and drops GET writes after unmount', async () => {
    const old = deferred<DriverDeliveryRoute>();
    const nextRoute = { ...operationalRoute, routePlanId: '88888888-8888-4888-8888-888888888888', routeName: 'New route',
      orders: operationalRoute.orders.map((order) => ({ ...order, destinationName: 'New route destination' })) };
    const nextContext = { ...context, executionContextId: '99999999-9999-4999-8999-999999999999', routePlanId: nextRoute.routePlanId };
    const accepted: string[] = [];
    const h = workspaceHarness({ loadedRoute: operationalRoute, routeApi: { loadDriverDeliveryRoute: async (_token: string, id: string) =>
      id === operationalRoute.routePlanId ? old.promise : nextRoute }, operationalApi: {
      DRIVER_OPERATIONAL_ENABLED: true, loadDriverExecutionContexts: async () => [context, nextContext],
    } });
    h.render({ notificationDestination: { notificationId: 'old', executionContextId: context.executionContextId, routePlanId: context.routePlanId },
      onNotificationDestinationAccepted: (id) => { accepted.push(id); } }); await h.settle();
    h.render({ notificationDestination: { notificationId: 'new', executionContextId: nextContext.executionContextId, routePlanId: nextContext.routePlanId } }); await h.settle();
    assert.deepEqual(accepted, ['new']); assert.equal(h.execution.summary?.destinationName, 'New route destination');
    h.unmount(); old.resolve(operationalRoute); await flush();
    assert.equal(h.lateWrites, 0);
  });
});
