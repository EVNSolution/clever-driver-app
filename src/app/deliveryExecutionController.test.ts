import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DriverLifecycleCommandIdentity } from '../api/dsvDriverEvents';
import * as driverEvents from '../api/dsvDriverEvents';

import * as executionState from '../domain/delivery/deliveryExecutionState';
import { buildCurrentDeliverySummary, PREVIEW_DELIVERY_ORDERS } from '../domain/delivery/deliveryPlan';

type HookModule = typeof import('../ui/driver/DeliveryExecutionActions');
type Options = Parameters<HookModule['useDeliveryExecution']>[0];
type Dialog = { title: string; actions?: { label: string; onPress?(): void }[] };

// Exercise the production hook's asynchronous callbacks without a native renderer.
// Native presentation and gesture behavior remain device smoke-test requirements.
function createHarness() {
  let state = executionState.INITIAL_DELIVERY_EXECUTION_STATE;
  let dialog: Dialog | null = null;
  const refs: { current: unknown }[] = [];
  let refIndex = 0;
  let uuidCounter = 0;
  const module = { exports: {} };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    react: {
      useReducer: (reducer: typeof executionState.reduceDeliveryExecutionState) => [
        state,
        (event: Parameters<typeof reducer>[1]) => { state = reducer(state, event); },
      ],
      useRef: (initial: unknown) => {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (styles: unknown) => styles } },
    'expo-modules-core': { uuid: { v4: () => `11111111-1111-4111-8111-${String(++uuidCounter).padStart(12, '0')}` } },
    '../../domain/delivery/deliveryExecutionState': executionState,
    '../../api/dsvDriverEvents': driverEvents,
    '../../platform/destinationMap': { openDestinationMap: async () => undefined },
    './AppDialog': { useAppDialog: () => ({
      dialog,
      showDialog: (options: Dialog) => { dialog = options; },
    }) },
    './DeliveryProofModal': { DeliveryProofModal: 'DeliveryProofModal' },
  };
  const source = readFileSync(new URL('../ui/driver/DeliveryExecutionActions.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } });
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    Error,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected runtime dependency: ${name}`);
      return dependencies[name];
    },
  });
  const hooks = module.exports as HookModule;
  return {
    hooks,
    render(options: Options) {
      refIndex = 0;
      return hooks.useDeliveryExecution(options);
    },
    press(label: string) {
      const action = dialog?.actions?.find((candidate) => candidate.label === label);
      assert.ok(action?.onPress, `Missing action ${label}`);
      dialog = null;
      return action.onPress;
    },
    get dialog() { return dialog; },
    dismissDialog() { dialog = null; },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function options(overrides: Partial<Options> = {}): Options {
  return {
    etaStatus: 'READY',
    isReadOnly: false,
    orderCount: PREVIEW_DELIVERY_ORDERS.length,
    summary: buildCurrentDeliverySummary(PREVIEW_DELIVERY_ORDERS, PREVIEW_DELIVERY_ORDERS[0]!.id),
    onCompleteDelivery: async () => false,
    onCompleteRoute: async () => undefined,
    onStartDelivery: async () => undefined,
    onUploadProof: async () => undefined,
    ...overrides,
  };
}

describe('persistent delivery execution controller callbacks', () => {
  it('releases the first definitively rejected completion identity and accepts an edited time with the same photo', async () => {
    const previousFetch = globalThis.fetch;
    const requests: DriverLifecycleCommandIdentity[] = [];
    const uploadedPhotos: unknown[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as DriverLifecycleCommandIdentity & { deliveryStopIds: string[] };
      requests.push({ clientEventId: body.clientEventId, occurredAt: body.occurredAt });
      return requests.length === 1
        ? new Response(JSON.stringify({ data: null, error: { code: 'FORBIDDEN', completionOutcome: 'NOT_APPLIED', message: 'Destination completion scope rejected' } }), { status: 403 })
        : new Response(JSON.stringify({ data: { completedStopCount: body.deliveryStopIds.length, eventIds: body.deliveryStopIds.map((id) => `accepted-event:${id}`) }, error: null }), { status: 202 });
    };
    const harness = createHarness();
    const photo = { uri: 'file:///first-rejection-proof.jpg', fileName: 'proof.jpg', idempotencyKey: 'proof-media-v1:44444444444444448444000000000001', mimeType: 'image/jpeg', source: 'camera' as const };
    const props = options({
      onResolveDeliveryCompletion: async () => { assert.fail('A first confirmed rejection does not need an old receipt lookup'); },
      onRefreshAssignment: () => { assert.fail('A first rejection or normal acceptance must not invoke receipt recovery refresh'); },
      onCompleteDelivery: async (destinationId, stopIds, identity) => {
        await driverEvents.completeDriverDeliveryDestination('route-token', 'route-1', destinationId, stopIds, identity);
        return false;
      },
      onUploadProof: async (_stopId, selected) => { uploadedPhotos.push(selected); },
    });
    try {
      let controller = harness.render(props);
      controller.confirmDeliveryCompletion(); controller = harness.render(props);
      await controller.submitDeliveryCompletion('2026-10-07T08:40:00.000Z', photo);
      controller = harness.render(props);
      assert.equal(controller.executionState.phase, 'proof');
      assert.equal(controller.executionState.proof?.completedAt, null);
      assert.equal(controller.executionState.proof?.completionIdentity, undefined);
      assert.equal(uploadedPhotos.length, 0);
      harness.dismissDialog();
      await controller.submitDeliveryCompletion('2026-10-07T08:45:00.000Z', photo);
      controller = harness.render(props);
      assert.equal(requests.length, 2);
      assert.notEqual(requests[1]!.clientEventId, requests[0]!.clientEventId);
      assert.equal(requests[1]!.occurredAt, '2026-10-07T08:45:00.000Z');
      assert.equal(controller.executionState.phase, 'idle');
      assert.equal(uploadedPhotos.length, 1);
      assert.equal(uploadedPhotos[0], photo);
    } finally {
      if (previousFetch === undefined) delete (globalThis as { fetch?: unknown }).fetch;
      else globalThis.fetch = previousFetch;
    }
  });

  it('allows closing after the first definitive destination rejection without sending another completion', async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: null, error: { code: 'FORBIDDEN', completionOutcome: 'NOT_APPLIED', message: 'Destination completion scope rejected' } }), { status: 403 });
    };
    const harness = createHarness();
    const props = options({
      onCompleteDelivery: async (destinationId, stopIds, identity) => {
        await driverEvents.completeDriverDeliveryDestination('route-token', 'route-1', destinationId, stopIds, identity);
        return false;
      },
      onRefreshAssignment: () => { assert.fail('Closing a confirmed first rejection must not invoke receipt recovery refresh'); },
    });
    try {
      let controller = harness.render(props);
      controller.confirmDeliveryCompletion(); controller = harness.render(props);
      await controller.submitDeliveryCompletion('2026-10-07T08:40:00.000Z', null);
      controller = harness.render(props); harness.dismissDialog();
      controller.closeProofDelivery(); controller = harness.render(props);
      assert.equal(controller.executionState.phase, 'idle');
      assert.equal(controller.isLocked, false);
      assert.equal(calls, 1);
    } finally {
      if (previousFetch === undefined) delete (globalThis as { fetch?: unknown }).fetch;
      else globalThis.fetch = previousFetch;
    }
  });

  it('keeps the original unknown identity and time when a later retry is definitively rejected with HTTP 403', async () => {
    const previousFetch = globalThis.fetch;
    const requests: DriverLifecycleCommandIdentity[] = [];
    const lookups: { destinationId: string; stopIds: string[]; identity: DriverLifecycleCommandIdentity }[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as DriverLifecycleCommandIdentity;
      requests.push({ clientEventId: body.clientEventId, occurredAt: body.occurredAt });
      if (requests.length === 1) throw new Error('Committed response lost before reassignment');
      return new Response(JSON.stringify({ data: null, error: { code: 'FORBIDDEN', completionOutcome: 'NOT_APPLIED', message: 'Current destination assignment changed' } }), { status: 403 });
    };
    const harness = createHarness();
    const props = options({
      onCompleteDelivery: async (destinationId, stopIds, identity) => {
        await driverEvents.completeDriverDeliveryDestination('route-token', 'route-1', destinationId, stopIds, identity);
        return false;
      },
      onResolveDeliveryCompletion: async (destinationId, stopIds, identity) => {
        lookups.push({ destinationId, stopIds: [...stopIds], identity: { ...identity } });
        return false;
      },
      onRefreshAssignment: () => { assert.fail('An unknown completion cannot refresh as an approved recovery'); },
    });
    try {
      let controller = harness.render(props);
      controller.confirmDeliveryCompletion(); controller = harness.render(props);
      await controller.submitDeliveryCompletion('2026-10-07T08:40:00.000Z', null);
      controller = harness.render(props); harness.dismissDialog();
      await controller.submitDeliveryCompletion('2026-10-07T08:45:00.000Z', null);
      controller = harness.render(props); harness.dismissDialog();
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1], requests[0]);
      assert.deepEqual(lookups, [{ destinationId: props.summary!.destinationId, stopIds: props.summary!.deliveryStopIds, identity: requests[0] }]);
      assert.deepEqual({ ...controller.executionState.proof?.completionIdentity }, requests[0]);
      assert.equal(controller.executionState.proof?.completedAt, null);
      controller.closeProofDelivery(); controller.confirmDeliveryCompletion(); controller = harness.render(props);
      assert.equal(controller.executionState.phase, 'proof');
      assert.deepEqual({ ...controller.executionState.proof?.completionIdentity }, requests[0]);
      assert.equal(controller.isLocked, true);
    } finally {
      if (previousFetch === undefined) delete (globalThis as { fetch?: unknown }).fetch;
      else globalThis.fetch = previousFetch;
    }
  });

  it('keeps the unknown identity when result-only lookup fails after a definite retry rejection', async () => {
    const harness = createHarness();
    const attempts: DriverLifecycleCommandIdentity[] = [];
    let lookupCalls = 0;
    const props = options({
      onCompleteDelivery: async (_destinationId, _stopIds, identity) => {
        attempts.push({ ...identity });
        if (attempts.length === 1) throw new driverEvents.DriverDeliveryCompletionApiError(0, 'COMPLETION_OUTCOME_UNKNOWN', 'unknown');
        throw new driverEvents.DriverDeliveryCompletionApiError(403, 'FORBIDDEN', 'rejected');
      },
      onResolveDeliveryCompletion: async () => {
        lookupCalls += 1;
        throw new Error('Account receipt lookup unavailable');
      },
      onRefreshAssignment: () => { assert.fail('A failed receipt lookup cannot refresh as an approved recovery'); },
      onUploadProof: async () => { assert.fail('Unconfirmed completion must not upload proof'); },
      onCompleteRoute: async () => { assert.fail('Unconfirmed completion must not finish the route'); },
    });
    let controller = harness.render(props);
    controller.confirmDeliveryCompletion(); controller = harness.render(props);
    await controller.submitDeliveryCompletion('2026-10-07T08:40:00.000Z', null);
    harness.dismissDialog(); controller = harness.render(props);
    await controller.submitDeliveryCompletion('2026-10-07T08:45:00.000Z', null);
    harness.dismissDialog(); controller = harness.render(props);
    assert.equal(lookupCalls, 1);
    assert.deepEqual(attempts[1], attempts[0]);
    assert.deepEqual({ ...controller.executionState.proof?.completionIdentity }, attempts[0]);
    assert.equal(controller.executionState.proof?.completedAt, null);
    controller.closeProofDelivery(); controller = harness.render(props);
    assert.equal(controller.executionState.phase, 'proof');
    assert.equal(controller.isLocked, true);
  });

  it('recovers an exact applied receipt after response loss and reassignment without uploading proof or completing a route', async () => {
    const previousFetch = globalThis.fetch;
    const requests: { url: string; authorization: string; body: Record<string, unknown> }[] = [];
    let completeCalls = 0;
    let originalLookupCalls = 0;
    let foreignCallbackCalls = 0;
    let uploadCalls = 0;
    let routeCalls = 0;
    const refreshedStopIds: string[][] = [];
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const url = String(input);
      requests.push({ url, body, authorization: (init?.headers as Record<string, string>).Authorization! });
      if (url.endsWith('/complete/result')) return new Response(JSON.stringify({ data: {
        ...body, status: 'APPLIED', completedStopCount: (body.deliveryStopIds as string[]).length,
        eventIds: (body.deliveryStopIds as string[]).map((id) => `event:${id}`),
      }, error: null }));
      completeCalls += 1;
      if (completeCalls === 1) throw new Error('Server committed the original command; its response was lost');
      return new Response(JSON.stringify({ data: null, error: {
        code: 'FORBIDDEN', completionOutcome: 'NOT_APPLIED', message: 'Original route assignment is no longer active',
      } }), { status: 403 });
    };
    const harness = createHarness();
    const photo = { uri: 'file:///before-reassignment-proof.jpg', fileName: 'proof.jpg', idempotencyKey: 'proof-media-v1:44444444444444448444000000000002', mimeType: 'image/jpeg', source: 'library' as const };
    const original = options({
      onCompleteDelivery: async (destinationId, stopIds, identity) => {
        await driverEvents.completeDriverDeliveryDestination('original-route-token', 'original-route', destinationId, stopIds, identity);
        return true;
      },
      onResolveDeliveryCompletion: async (destinationId, stopIds, identity) => {
        originalLookupCalls += 1;
        return driverEvents.lookupDriverDeliveryCompletionResult('original-account-jwt', 'original-route', destinationId, stopIds, identity);
      },
      onUploadProof: async () => { uploadCalls += 1; },
      onCompleteRoute: async () => { routeCalls += 1; },
      onRefreshAssignment: (stopIds) => { refreshedStopIds.push([...stopIds]); },
    });
    const changed = options({ summary: null, isReadOnly: true,
      onCompleteDelivery: async () => { foreignCallbackCalls += 1; return true; },
      onResolveDeliveryCompletion: async () => { foreignCallbackCalls += 1; return true; },
      onUploadProof: async () => { foreignCallbackCalls += 1; },
      onCompleteRoute: async () => { foreignCallbackCalls += 1; },
      onRefreshAssignment: () => { foreignCallbackCalls += 1; },
    });
    try {
      let controller = harness.render(original);
      controller.confirmDeliveryCompletion(); controller = harness.render(original);
      await controller.submitDeliveryCompletion('2026-10-07T08:40:00.000Z', photo);
      assert.equal(refreshedStopIds.length, 0);
      harness.dismissDialog(); controller = harness.render(changed);
      await controller.submitDeliveryCompletion('2026-10-07T08:45:00.000Z', photo);
      harness.dismissDialog(); controller = harness.render(changed);
      assert.equal(completeCalls, 2);
      assert.equal(originalLookupCalls, 1);
      assert.equal(foreignCallbackCalls, 0);
      assert.deepEqual(requests[1]!.body, requests[0]!.body);
      assert.deepEqual(requests[2]!.body, requests[0]!.body);
      assert.equal(requests[2]!.authorization, 'Bearer original-account-jwt');
      assert.equal(controller.executionState.proof?.completedAt, '2026-10-07T08:40:00.000Z');
      assert.equal(controller.executionState.proof?.requiresAssignmentRefresh, true);
      assert.equal(controller.executionState.phase, 'proof');
      assert.equal(controller.isLocked, true);
      assert.equal(refreshedStopIds.length, 0);
      const overlay = harness.hooks.DeliveryExecutionOverlay({ controller }) as unknown as { props: Record<string, unknown> };
      assert.equal(overlay.props.requiresAssignmentRefresh, true);
      assert.equal(overlay.props.savedCompletionOccurredAt, '2026-10-07T08:40:00.000Z');
      await controller.submitDeliveryCompletion('2026-10-07T09:00:00.000Z', photo);
      assert.equal(requests.length, 3);
      assert.equal(uploadCalls, 0);
      assert.equal(routeCalls, 0);
      const closeRecovered = controller.closeProofDelivery;
      closeRecovered(); closeRecovered(); await flush(); controller = harness.render(changed);
      assert.equal(controller.executionState.phase, 'idle');
      assert.equal(controller.isLocked, false);
      assert.equal(uploadCalls, 0);
      assert.equal(routeCalls, 0);
      assert.deepEqual(refreshedStopIds, [original.summary!.deliveryStopIds]);
      assert.equal(foreignCallbackCalls, 0);
    } finally {
      if (previousFetch === undefined) delete (globalThis as { fetch?: unknown }).fetch;
      else globalThis.fetch = previousFetch;
    }
  });
  it('keeps one pending completion across tab presentations and retries the original final route after summary disappears', async () => {
    const harness = createHarness();
    const pending = deferred<boolean>();
    let stopCalls = 0;
    let originalRouteCalls = 0;
    let foreignRouteCalls = 0;
    const uploadedStops: string[] = [];
    const initial = options({
      onCompleteDelivery: () => { stopCalls += 1; return pending.promise; },
      onCompleteRoute: async () => {
        originalRouteCalls += 1;
        if (originalRouteCalls === 1) throw new Error('retry this route');
      },
      onUploadProof: async (stopId) => { uploadedStops.push(stopId); },
    });
    let controller = harness.render(initial);
    harness.hooks.DeliveryExecutionActions({ controller, variant: 'delivery' });
    controller.confirmDeliveryCompletion();
    controller = harness.render(initial);
    assert.equal(controller.executionState.proof?.destinationId, initial.summary!.destinationId);
    const submitted = controller.submitDeliveryCompletion(
      '2026-09-10T05:42:00.000Z',
      { uri: 'file:///proof.jpg', fileName: 'proof.jpg', idempotencyKey: 'proof-media-v1:11111111111141118111000000000001', mimeType: 'image/jpeg', source: 'camera' },
    );
    void controller.submitDeliveryCompletion('2026-09-10T05:43:00.000Z', null);
    assert.equal(stopCalls, 1);

    const refreshed = options({
      summary: null,
      isReadOnly: true,
      onCompleteRoute: async () => { foreignRouteCalls += 1; },
      onUploadProof: async () => { foreignRouteCalls += 1; },
    });
    controller = harness.render(refreshed);
    harness.hooks.DeliveryExecutionActions({ controller, variant: 'map' });
    assert.equal(controller.isLocked, true);
    assert.equal(controller.isCompletionDisabled, true);
    pending.resolve(true);
    await submitted;
    await flush();
    controller = harness.render(refreshed);
    assert.equal(controller.executionState.proof?.deliveryStopId, initial.summary!.deliveryStopId);
    assert.deepEqual(uploadedStops, [initial.summary!.deliveryStopId]);

    assert.equal(harness.dialog?.title, '배차 완료 실패');
    assert.ok(controller.dialog);
    assert.ok(controller.executionState.proof);
    assert.equal(controller.isLocked, true);
    harness.press('다시 시도')();
    await flush();
    controller = harness.render(refreshed);
    assert.equal(originalRouteCalls, 2);
    assert.equal(foreignRouteCalls, 0);
    assert.equal(controller.executionState.proof, null);
    assert.equal(controller.isLocked, false);
  });

  it('retains the saved completion time while retrying a failed proof upload', async () => {
    const harness = createHarness();
    const savedTimes: string[] = [];
    const uploadedKeys: string[] = [];
    let uploads = 0;
    const props = options({
      onCompleteDelivery: async (_destinationId, _stopIds, identity) => {
        savedTimes.push(identity.occurredAt);
        return false;
      },
      onUploadProof: async (_stopId, photo) => {
        uploads += 1;
        uploadedKeys.push(photo.idempotencyKey);
        if (uploads === 1) throw new Error('offline during proof upload');
      },
    });
    const photo = {
      uri: 'file:///proof.jpg', fileName: 'proof.jpg', idempotencyKey: 'proof-media-v1:11111111111141118111000000000002', mimeType: 'image/jpeg', source: 'camera' as const,
    };
    let controller = harness.render(props);
    controller.confirmDeliveryCompletion();
    controller = harness.render(props);
    await controller.submitDeliveryCompletion('2026-09-10T05:42:00.000Z', photo);
    controller = harness.render(props);
    assert.equal(controller.executionState.proof?.completedAt, '2026-09-10T05:42:00.000Z');
    assert.equal(harness.dialog?.title, '증빙 업로드 실패');
    harness.dismissDialog();
    await controller.submitDeliveryCompletion('2026-09-10T06:00:00.000Z', photo);
    controller = harness.render(props);
    assert.deepEqual(savedTimes, ['2026-09-10T05:42:00.000Z']);
    assert.equal(uploads, 2);
    assert.deepEqual(uploadedKeys, [photo.idempotencyKey, photo.idempotencyKey]);
    assert.equal(controller.executionState.phase, 'idle');
  });

  it('retains the submitted identity through close and reopen attempts after completion commits but its response is lost', async () => {
    const harness = createHarness();
    const attempts: DriverLifecycleCommandIdentity[] = [];
    const committed = new Map<string, string>();
    const props = options({
      onCompleteDelivery: async (_destinationId, _stopIds, identity) => {
        attempts.push({ ...identity });
        if (!committed.has(identity.clientEventId)) {
          committed.set(identity.clientEventId, identity.occurredAt);
          throw new Error('Committed completion response was lost');
        }
        assert.equal(identity.occurredAt, committed.get(identity.clientEventId));
        return false;
      },
    });
    let controller = harness.render(props);
    controller.confirmDeliveryCompletion();
    controller = harness.render(props);
    const submitBeforeRender = controller.submitDeliveryCompletion;
    const closeBeforeRender = controller.closeProofDelivery;
    const reopenBeforeRender = controller.confirmDeliveryCompletion;
    const submitted = submitBeforeRender('2026-09-10T05:42:00.000Z', null);
    closeBeforeRender(); reopenBeforeRender();
    await submitted;
    controller = harness.render(props);
    assert.equal(controller.executionState.proof?.completedAt, null);
    assert.equal(controller.executionState.phase, 'proof');
    assert.deepEqual({ ...controller.executionState.proof?.completionIdentity }, attempts[0]);
    assert.equal(committed.size, 1);
    controller.closeProofDelivery(); controller.confirmDeliveryCompletion();
    controller = harness.render(props);
    assert.equal(controller.executionState.phase, 'proof');
    assert.deepEqual({ ...controller.executionState.proof?.completionIdentity }, attempts[0]);
    harness.dismissDialog();
    await controller.submitDeliveryCompletion('2026-09-10T06:00:00.000Z', null);
    controller = harness.render(props);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
    assert.equal(committed.size, 1);
    assert.equal(attempts[1]?.occurredAt, '2026-09-10T05:42:00.000Z');
    assert.equal(controller.executionState.phase, 'idle');
  });

  it('allows only one start request while another tab presentation is pending', async () => {
    const harness = createHarness();
    const pending = deferred<void>();
    let calls = 0;
    const props = options({ etaStatus: 'PRE_PICKUP', onStartDelivery: () => { calls += 1; return pending.promise; } });
    let controller = harness.render(props);
    controller.confirmDeliveryStart();
    const accept = harness.press('시작');
    accept();
    accept();
    controller = harness.render(props);
    harness.hooks.DeliveryExecutionActions({ controller, variant: 'map' });
    controller.confirmDeliveryStart();
    assert.equal(harness.dialog, null);
    assert.equal(calls, 1);
    assert.equal(controller.isLocked, true);
    pending.resolve();
    await flush();
    controller = harness.render(props);
    assert.equal(controller.isLocked, false);
  });

  it('protects synchronously before opening completion and keeps the approved stop immutable during photo retry', async () => {
    const harness = createHarness();
    const upload = deferred<void>();
    const transitions: string[] = [];
    const stopCalls: { destinationId: string; stops: string[]; occurredAt: string }[] = [];
    const uploadedStops: string[] = [];
    const props = options({
      onWorkStarted: () => { transitions.push('protected'); },
      onCompleteDelivery: async (destinationId, stops, identity) => {
        transitions.push('completed'); stopCalls.push({ destinationId, stops, occurredAt: identity.occurredAt }); return false;
      },
      onUploadProof: async (stopId) => { uploadedStops.push(stopId); await upload.promise; },
    });
    const photo = { uri: 'file:///retained-proof.jpg', fileName: 'proof.jpg', idempotencyKey: 'proof-media-v1:11111111111141118111000000000003', mimeType: 'image/jpeg', source: 'library' as const };
    let controller = harness.render(props);
    controller.confirmDeliveryCompletion();
    assert.deepEqual(transitions, ['protected']);
    assert.equal(stopCalls.length, 0);
    controller = harness.render(props);
    assert.equal(controller.isLocked, true);
    const submitted = controller.submitDeliveryCompletion('2026-10-07T06:42:00.000Z', photo);
    await flush();
    controller = harness.render(props);
    assert.equal(controller.executionState.phase, 'uploading-proof');
    assert.equal(controller.executionState.proof?.completedAt, '2026-10-07T06:42:00.000Z');
    assert.equal(controller.isLocked, true);
    await controller.submitDeliveryCompletion('2026-10-07T07:00:00.000Z', photo);
    assert.equal(stopCalls.length, 1);
    assert.deepEqual(uploadedStops, [props.summary!.deliveryStopId]);
    assert.deepEqual(stopCalls, [{ destinationId: props.summary!.destinationId, stops: props.summary!.deliveryStopIds, occurredAt: '2026-10-07T06:42:00.000Z' }]);
    upload.resolve(); await submitted;
    controller = harness.render(props);
    assert.equal(controller.executionState.phase, 'idle');
    assert.equal(controller.isLocked, false);
  });
});
