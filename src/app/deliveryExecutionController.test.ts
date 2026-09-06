import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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
    '../../domain/delivery/deliveryExecutionState': executionState,
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
    const accept = harness.press('완료');
    accept();
    accept();
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
    await flush();
    controller = harness.render(refreshed);
    assert.equal(controller.executionState.proof?.deliveryStopId, initial.summary!.deliveryStopId);
    await controller.uploadProof({ uri: 'file:///proof.jpg', fileName: 'proof.jpg', mimeType: 'image/jpeg', source: 'camera' });
    assert.deepEqual(uploadedStops, [initial.summary!.deliveryStopId]);

    controller.closeProofDelivery();
    await flush();
    controller = harness.render(refreshed);
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
});
