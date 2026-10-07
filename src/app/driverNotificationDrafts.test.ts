import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import * as plan from '../domain/delivery/deliveryPlan';
import * as notes from '../domain/delivery/destinationNotesPreview';
import * as sortable from '../domain/delivery/sortableOrder';
import * as finalEta from '../domain/delivery/finalDeliveryEta';
import type { DriverOperationalInboxItem } from '../api/dsvDriverOperational';

type ProtectionProps = { onWorkProtectionChange?(isProtected: boolean): void };
type DeliveryProps = Parameters<typeof import('../ui/driver/DeliveryScreen')['DeliveryScreen']>[0] & ProtectionProps;
type ExceptionProps = Parameters<typeof import('../ui/driver/DriverDeliveryException')['DriverDeliveryException']>[0] & ProtectionProps;
type Element = { type: unknown; props: Record<string, unknown> };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

// Execute real component hooks, effects, and rendered handlers. Native gestures/layout remain a device check.
function componentHarness<P extends object>(fileName: string, exportName: string, initialProps: P,
  extraDependencies: Record<string, unknown> = {}) {
  const slots: unknown[] = [];
  type Effect = { deps: unknown[]; cleanup?: (() => void) | void };
  const effects = new Map<number, Effect>();
  const pending: (() => void)[] = [];
  let index = 0;
  let dirty = false;
  let active = true;
  let tree: unknown;
  let lateWrites = 0;
  let dialog: unknown;
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', Modal: 'Modal',
    ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ fontScale: 1 }) };
  const dependencies: Record<string, unknown> = {
    react: {
      useRef: (initial: unknown) => { const slot = index++; return slots[slot] ?? (slots[slot] = { current: initial }); },
      useState: (initial: unknown) => {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (value: unknown) => {
          if (!active) lateWrites += 1;
          const next = typeof value === 'function' ? value(slots[slot]) : value;
          if (!Object.is(next, slots[slot])) { slots[slot] = next; dirty = true; }
        }];
      },
      useEffect: (setup: () => void | (() => void), deps: unknown[]) => {
        const slot = index++; const old = effects.get(slot);
        if (!same(old?.deps, deps)) pending.push(() => { old?.cleanup?.(); effects.set(slot, { deps, cleanup: setup() }); });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': native,
    'react-native-gesture-handler': {}, 'react-native-reanimated': {}, 'react-native-worklets': {},
    '../../domain/delivery/deliveryPlan': plan,
    '../../domain/delivery/destinationNotesPreview': notes,
    '../../domain/delivery/sortableOrder': sortable,
    '../../domain/delivery/finalDeliveryEta': finalEta,
    './AppDialog': { useAppDialog: () => ({ dialog: null, showDialog: (value: unknown) => { dialog = value; } }) },
    './DeliveryExecutionActions': { DeliveryExecutionActions: 'DeliveryExecutionActions' },
    './DriverRefreshControl': { DriverRefreshControl: 'DriverRefreshControl' },
    './DeliveryRouteMap': { DeliveryRouteMap: 'DeliveryRouteMap' },
    './DestinationNotesSheet': { DestinationNotesSheet: 'DestinationNotesSheet' },
    ...extraDependencies,
  };
  const source = readFileSync(new URL(`../ui/driver/${fileName}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, Error, Date, Map, Set, Promise,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected production dependency: ${name}`); return dependencies[name]; } });
  const component = (module.exports as Record<string, (props: P) => unknown>)[exportName]!;
  let props = initialProps;
  function render(next: Partial<P> = {}) {
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
    async settle() { for (let i = 0; i < 5; i++) { await flush(); if (dirty) render(); } },
    find(predicate: (element: Element) => boolean) { return nodes(tree).find(predicate); },
    findAll(predicate: (element: Element) => boolean) { return nodes(tree).filter(predicate); },
    get dialog() { return dialog; },
    get lateWrites() { return lateWrites; },
    unmount() { active = false; for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

export function createDeliveryDraftHarness(initial: Partial<DeliveryProps> = {}) {
  const props: DeliveryProps = {
    deliveryDate: '2026-10-07', destinationNotesById: {}, executionController: {} as DeliveryProps['executionController'],
    etaStatus: 'READY', executionStatus: 'IN_PROGRESS', pickupCompletedAt: null,
    isEditing: false, isReadOnly: false, isSequenceEditingSupported: true, lastUpdatedAt: null, nextDeliveryStopId: null,
    onAcknowledgeTimeConstraint: async () => undefined, onEditingChange: () => undefined, onOpenDeliverySpace: () => undefined,
    onReadDriverMessage: async () => undefined, onRefresh: () => undefined, onSequenceSavingChange: () => undefined,
    onSaveDestinationNotes: async (_id, previous) => previous, onSaveDeliveryOrder: async () => undefined,
    orders: plan.PREVIEW_DELIVERY_ORDERS.slice(0, 3), refreshing: false, serverRouteGeometry: null, timezone: 'Asia/Seoul', ...initial,
  };
  return componentHarness('DeliveryScreen.tsx', 'DeliveryScreen', props);
}

export function createExceptionDraftHarness(initial: Partial<ExceptionProps> = {}) {
  const props: ExceptionProps = {
    destinationName: '합성 배송지', reasons: [{ code: 'SYNTHETIC_ONLY', label: '합성 사유', requiresExplanation: true }],
    onSubmit: async () => undefined, ...initial,
  };
  return componentHarness('DriverDeliveryException.tsx', 'DriverDeliveryException', props);
}

function invoke(element: Element | undefined, key: string, ...args: unknown[]) {
  assert.ok(element, `Missing production element for ${key}`);
  const handler = element.props[key] as (...values: unknown[]) => unknown;
  assert.equal(typeof handler, 'function'); return handler(...args);
}

describe('Production notification work protection and draft retention', () => {
  it('preserves the reordered destination draft during benign parent orders and refresh updates', async () => {
    const original = plan.PREVIEW_DELIVERY_ORDERS.slice(0, 3);
    let editing = false; let saved: plan.DeliveryOrder[] = [];
    const h = createDeliveryDraftHarness({ orders: original, onEditingChange: (value) => { editing = value; },
      onSaveDeliveryOrder: async (orders) => { saved = orders; } }); h.render();
    invoke(h.find((element) => element.props.accessibilityLabel === '배송 순서 편집'), 'onPress');
    h.render({ isEditing: editing });
    const editor = () => h.find((element) => typeof element.type === 'function' && element.type.name === 'OrderSequenceEditor');
    invoke(editor(), 'onDrop', original[0]!.destinationId, 2); h.render();
    const ids = [original[1]!.id, original[2]!.id, original[0]!.id];
    assert.deepEqual((editor()!.props.orders as plan.DeliveryOrder[]).map(({ id }) => id), ids);
    h.render({ orders: original.map((order) => ({ ...order })), refreshing: true, lastUpdatedAt: new Date() }); await h.settle();
    assert.deepEqual((editor()!.props.orders as plan.DeliveryOrder[]).map(({ id }) => id), ids);
    await invoke(editor(), 'onDone');
    assert.deepEqual(saved.map(({ id }) => id), ids); assert.equal(editing, false); h.unmount();
  });

  it('protects the notes sheet and a pending order action until both have ended', async () => {
    const protection: boolean[] = []; const pending = deferred<void>();
    const h = createDeliveryDraftHarness({ onWorkProtectionChange: (value) => { protection.push(value); },
      onReadDriverMessage: () => pending.promise }); h.render();
    const row = h.find((element) => 'onOpenDeliveryInformation' in element.props);
    invoke(row, 'onOpenDeliveryInformation'); h.render();
    assert.equal(protection.at(-1), true);
    const sheet = h.find((element) => element.type === 'DestinationNotesSheet');
    const reading = invoke(sheet, 'onReadDriverMessage', 'synthetic-message') as Promise<void>;
    invoke(sheet, 'onClose'); h.render();
    assert.equal(protection.at(-1), true);
    pending.resolve(); await reading; h.render(); await h.settle();
    assert.equal(protection.at(-1), false); h.unmount();
  });

  it('retains exception reason and text during parent updates, failure, close, and reopen', async () => {
    const protection: boolean[] = []; const pending = deferred<void>(); const reports: unknown[][] = [];
    const h = createExceptionDraftHarness({ onWorkProtectionChange: (value) => { protection.push(value); },
      onSubmit: (...values) => { reports.push(values); return pending.promise; } }); h.render();
    invoke(h.find((element) => element.type === 'Pressable'), 'onPress'); h.render();
    assert.equal(protection.at(-1), true);
    invoke(h.find((element) => element.props.accessibilityRole === 'radio'), 'onPress');
    invoke(h.find((element) => element.type === 'TextInput'), 'onChangeText', '입력한 합성 보고'); h.render();
    h.render({ destinationName: '같은 배송지 최신 표시', reasons: [{ code: 'SYNTHETIC_ONLY', label: '합성 사유', requiresExplanation: true }] });
    assert.equal(h.find((element) => element.type === 'TextInput')?.props.value, '입력한 합성 보고');
    const send = h.findAll((element) => element.type === 'Pressable').find((element) =>
      Array.isArray(element.props.children) ? false : (element.props.children as Element | undefined)?.props.children === '보고 전송');
    invoke(send, 'onPress'); h.render();
    assert.deepEqual(reports, [['SYNTHETIC_ONLY', '입력한 합성 보고']]);
    invoke(h.find((element) => element.type === 'Modal'), 'onRequestClose'); h.render();
    assert.ok(h.find((element) => element.type === 'Modal')); assert.equal(protection.at(-1), true);
    pending.reject(new Error('승인 대기')); await h.settle();
    assert.equal(h.find((element) => element.type === 'TextInput')?.props.value, '입력한 합성 보고');
    invoke(h.find((element) => element.type === 'Modal'), 'onRequestClose'); h.render();
    assert.equal(protection.at(-1), false);
    invoke(h.find((element) => element.type === 'Pressable'), 'onPress'); h.render();
    assert.equal(h.find((element) => element.type === 'TextInput')?.props.value, '입력한 합성 보고');
    assert.equal((h.find((element) => element.props.accessibilityRole === 'radio')?.props.accessibilityState as { checked: boolean }).checked, true);
    h.unmount(); assert.equal(protection.at(-1), false);
  });
});

function inboxItem(id: string, title: string): DriverOperationalInboxItem {
  return { id, kind: 'N01', businessStatus: 'OPEN', ackedAt: null,
    createdAt: '2026-10-07T01:00:00.000Z', expiresAt: '2026-10-07T04:00:00.000Z', summary: { title, body: '합성 알림' } };
}
type InboxProps = Parameters<typeof import('../ui/driver/DriverOperationalInbox')['DriverOperationalInbox']>[0];
function createInboxHarness(load: (token: string, cursor?: string) => Promise<{ items: DriverOperationalInboxItem[]; nextCursor: string | null }>, isolated = false) {
  const acknowledgements: string[] = [];
  const opened: string[] = [];
  const scheduled: DriverOperationalInboxItem[] = [];
  let businessPosts = 0;
  const forbiddenBusinessPost = async () => { businessPosts += 1; throw new Error('Inbox must not issue business commands'); };
  const h = componentHarness<InboxProps>('DriverOperationalInbox.tsx', 'DriverOperationalInbox', {
    accessToken: 'synthetic-account-token', refreshRequestKey: 0, onClose: () => undefined, onOpen: (id) => { opened.push(id); },
  }, {
    '../../api/dsvDriverOperational': {
      loadDriverOperationalInbox: load,
      acknowledgeDriverOperationalNotification: async (_token: string, _id: string, kind: string) => {
        acknowledgements.push(kind); return { ackedAt: '2026-10-07T01:00:00.000Z', notificationId: _id };
      },
      startDriverExecution: forbiddenBusinessPost, reportDriverDeliveryException: forbiddenBusinessPost,
    },
    '../../platform/expo/notifications/expoDriverNotificationService': {
      canScheduleIsolatedDriverInboxNotification: () => isolated,
      scheduleIsolatedDriverInboxNotification: async (item: DriverOperationalInboxItem) => { scheduled.push(item); },
    },
    '../../api/dsvDriverEvents': {
      startDriverDeliveryRoute: forbiddenBusinessPost, completeDriverDeliveryRoute: forbiddenBusinessPost,
      completeDriverDeliveryDestination: forbiddenBusinessPost,
    },
  });
  return { ...h, acknowledgements, opened, scheduled, get businessPosts() { return businessPosts; } };
}

describe('Production inbox receipt refresh after pagination', () => {
  it('shows the guarded isolated scheduler only and forwards the exact server inbox item', async () => {
    const item = inboxItem('31200000-0000-4000-8000-000000000006', '정확한 N06');
    item.kind = 'N06';
    const production = createInboxHarness(async () => ({ items: [item], nextCursor: null }));
    production.render(); await production.settle();
    assert.equal(production.find((element) => element.props.label === '10초 뒤 합성 알림'), undefined);
    production.unmount();

    const isolated = createInboxHarness(async () => ({ items: [item], nextCursor: null }), true);
    isolated.render(); await isolated.settle();
    await invoke(isolated.find((element) => element.props.label === '10초 뒤 합성 알림'), 'onPress');
    isolated.render(); await isolated.settle();
    assert.deepEqual(isolated.scheduled, [item]);
    assert.ok(isolated.find((element) => element.type === 'Text'
      && element.props.children === '10초 뒤 합성 Android 알림이 표시됩니다. 알림창에서 눌러 주세요.'));
    assert.equal(isolated.businessPosts, 0);
    isolated.unmount();
  });

  it('requests and replaces the first page on a new receipt key without business commands or OPENED acknowledgement', async () => {
    const cursors: (string | undefined)[] = [];
    const first = inboxItem('first', '기존 첫 페이지'); const older = inboxItem('older', '이전 페이지');
    const received = inboxItem('received', '새로 받은 첫 페이지');
    const h = createInboxHarness(async (_token, cursor) => {
      cursors.push(cursor);
      if (cursor !== undefined) return { items: [older], nextCursor: null };
      return { items: cursors.length === 1 ? [first] : [received], nextCursor: cursors.length === 1 ? 'older-cursor' : null };
    }); h.render(); await h.settle();
    invoke(h.find((element) => element.props.label === '더 보기'), 'onPress'); h.render(); await h.settle();
    assert.ok(h.find((element) => element.type === 'Text' && element.props.children === older.summary.title));
    h.render({ refreshRequestKey: 1 }); await h.settle();
    assert.deepEqual(cursors, [undefined, 'older-cursor', undefined]);
    assert.ok(h.find((element) => element.type === 'Text' && element.props.children === received.summary.title));
    assert.equal(h.find((element) => element.type === 'Text' && element.props.children === first.summary.title), undefined);
    assert.equal(h.find((element) => element.type === 'Text' && element.props.children === older.summary.title), undefined);
    assert.equal(h.businessPosts, 0); assert.deepEqual(h.acknowledgements, []); assert.deepEqual(h.opened, []); h.unmount();
  });

  it('ignores a late older-page response after a new receipt refreshed the first page', async () => {
    const oldPage = deferred<{ items: DriverOperationalInboxItem[]; nextCursor: string | null }>();
    const cursors: (string | undefined)[] = [];
    const first = inboxItem('first', '기존 첫 페이지'); const older = inboxItem('older', '늦은 이전 페이지');
    const received = inboxItem('received', '현재 새 알림');
    const h = createInboxHarness(async (_token, cursor) => {
      cursors.push(cursor);
      if (cursor !== undefined) return oldPage.promise;
      return { items: cursors.length === 1 ? [first] : [received], nextCursor: cursors.length === 1 ? 'older-cursor' : null };
    }); h.render(); await h.settle();
    invoke(h.find((element) => element.props.label === '더 보기'), 'onPress'); h.render();
    h.render({ refreshRequestKey: 1 }); await h.settle();
    oldPage.resolve({ items: [older], nextCursor: null }); await h.settle();
    assert.deepEqual(cursors, [undefined, 'older-cursor', undefined]);
    assert.ok(h.find((element) => element.type === 'Text' && element.props.children === received.summary.title));
    assert.equal(h.find((element) => element.type === 'Text' && element.props.children === older.summary.title), undefined);
    assert.equal(h.businessPosts, 0); assert.deepEqual(h.acknowledgements, []); assert.deepEqual(h.opened, []); h.unmount();
  });
});
