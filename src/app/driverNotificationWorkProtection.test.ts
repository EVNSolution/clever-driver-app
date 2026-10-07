import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DriverDeliveryRoute } from '../api/dsvDriverRoute';
import type { DriverProofPhotoUpload } from '../api/dsvDriverProofMedia';
import { DriverOperationalApiError, type DriverExecutionContext, type DriverNotificationResolution } from '../api/dsvDriverOperational';
import { PREVIEW_DELIVERY_ORDERS } from '../domain/delivery/deliveryPlan';
import type { DriverNotificationClick } from '../domain/notifications/driverPushNotification';
import { appRootHarness } from './driverNotificationAppRoot.test';
import { createDeliveryDraftHarness } from './driverNotificationDrafts.test';
import { workspaceHarness } from './driverWorkspaceReads.test';

type ScreenProps = Parameters<typeof import('../ui/driver/DeliveryScreen')['DeliveryScreen']>[0];
type RootHarnessOptions = NonNullable<Parameters<typeof appRootHarness>[0]>;
const notificationId = '31200000-0000-4000-8000-000000000071';
const routeAId = '31200000-0000-4000-8000-000000000072';
const routeBId = '31200000-0000-4000-8000-000000000073';
const childAId = '31200000-0000-4000-8000-000000000074';
const childBId = '31200000-0000-4000-8000-000000000075';
const stopAId = '31200000-0000-4000-8000-000000000076';
const stopASecondId = '31200000-0000-4000-8000-000000000077';
const stopBId = '31200000-0000-4000-8000-000000000078';
const contextAId = '31200000-0000-4000-8000-000000000079';
const contextBId = '31200000-0000-4000-8000-000000000080';
const click: DriverNotificationClick = {
  notificationId, kind: 'N06', schemaVersion: '1', status: 'current', expiresAt: '2099-10-07T01:00:00.000Z',
};

const routeA: DriverDeliveryRoute = {
  availableRoutes: [], deliveryDate: '2026-10-07', depotCoordinate: null, destinationNotesById: {},
  etaStatus: 'READY', executionStatus: 'IN_PROGRESS', nextDeliveryStopId: stopAId,
  orders: [
    { ...PREVIEW_DELIVERY_ORDERS[0]!, id: stopAId, destinationId: 'destination-A', destinationName: 'Current route first', status: 'PENDING' },
    { ...PREVIEW_DELIVERY_ORDERS[1]!, id: stopASecondId, destinationId: 'destination-A-second', destinationName: 'Current route second', status: 'PENDING' },
  ],
  pickupCompletedAt: '2026-10-07T00:00:00Z', routeAccessToken: 'route-A-token', routeContext: routeAId,
  routeId: routeAId, routeName: 'Current route', routePlanId: routeAId, routeVersionId: childAId,
  serverRouteGeometry: null, timezone: 'Asia/Seoul',
};
const routeB: DriverDeliveryRoute = {
  ...routeA, routeId: routeBId, routePlanId: routeBId, routeContext: routeBId, routeName: 'Notification route',
  routeVersionId: childBId, routeAccessToken: 'route-B-token', nextDeliveryStopId: stopBId,
  orders: [{ ...routeA.orders[0]!, id: stopBId, destinationId: 'destination-B', destinationName: 'Notification destination' }],
};
const contexts: DriverExecutionContext[] = [routeA, routeB].map((route, index) => ({
  executionContextId: index === 0 ? contextAId : contextBId, routePlanId: route.routePlanId,
  routeVersion: 1, assignmentEpoch: '1', assignmentGeneration: '1', expectedRouteVersionId: route.routeVersionId!,
  serviceDate: route.deliveryDate, status: 'ACTIVE', startedAt: route.pickupCompletedAt,
}));
const destination: DriverNotificationResolution = {
  notificationId, destination: { type: 'EXECUTION', executionContextId: contextBId, routePlanId: routeBId, targetStopId: stopBId },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

// Feed real AppRoot child props into real Workspace renders/effects. Only native leaves are stubbed.
async function connectedWorkspace(options: {
  resolver?: (token: string, id: string) => Promise<DriverNotificationResolution>;
  realExecution?: boolean;
  proofApi?: Record<string, unknown>;
  syntheticStopCompletion?: boolean;
  loadRoute?: (routePlanId: string) => Promise<DriverDeliveryRoute>;
  appStorage?: RootHarnessOptions['storage'];
  acknowledge?: RootHarnessOptions['acknowledge'];
} = {}) {
  const reads = { choices: 0, routes: [] as string[], contexts: 0 };
  const businessPosts: RequestInit[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'POST') businessPosts.push(init);
    if (options.syntheticStopCompletion && String(url).endsWith('/driver/destinations/complete')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.routePlanId, routeAId);
      assert.deepEqual(body.deliveryStopIds, [stopAId]);
      return new Response(JSON.stringify({ data: { eventId: 'synthetic-STOP_DELIVERED' }, error: null }));
    }
    throw new Error('A notification read must not make a business request');
  };
  const executionLock = { current: false };
  let deliveryDraft: ReturnType<typeof createDeliveryDraftHarness> | undefined;
  const app = appRootHarness({ resolver: options.resolver ?? (async () => destination),
    storage: options.appStorage, acknowledge: options.acknowledge });
  const workspace = workspaceHarness({ loadedRoute: routeA, executionLock,
    realExecution: options.realExecution, proofApi: options.proofApi, routeApi: {
    loadDriverDeliveryRouteChoices: async () => {
      reads.choices += 1;
      return [routeA, routeB].map((route) => ({
        deliveryDate: route.deliveryDate, executionStatus: route.executionStatus,
        routeAccessToken: route.routeAccessToken, routeContext: route.routeContext,
        routeName: route.routeName, routePlanId: route.routePlanId,
      }));
    },
    loadDriverDeliveryRoute: async (_token: string, routePlanId: string) => {
      reads.routes.push(routePlanId);
      assert.ok([routeAId, routeBId].includes(routePlanId));
      return options.loadRoute?.(routePlanId) ?? (routePlanId === routeAId ? routeA : routeB);
    },
  }, operationalApi: {
    DRIVER_OPERATIONAL_ENABLED: true,
    loadDriverExecutionContexts: async () => { reads.contexts += 1; return contexts; },
  } });
  const harness = {
    app, workspace, executionLock, reads, businessPosts,
    async settle() {
      for (let index = 0; index < 5; index += 1) {
        await app.settle();
        const props = app.workspace();
        assert.ok(props, 'AppRoot must keep the same authenticated Workspace mounted');
        workspace.render(props);
        await workspace.settle();
        const screen = workspace.find((element) => element.type === 'DeliveryScreen');
        if (deliveryDraft !== undefined && screen !== undefined) {
          deliveryDraft.render(screen.props as ScreenProps);
          await deliveryDraft.settle();
        }
      }
      await app.settle();
    },
    screen(): ScreenProps {
      const screen = workspace.find((element) => element.type === 'DeliveryScreen');
      assert.ok(screen, 'The current delivery screen must remain available');
      return screen.props as ScreenProps;
    },
    snapshotReads() { return { choices: reads.choices, routes: [...reads.routes], contexts: reads.contexts }; },
    attachDeliveryDraft(draft: ReturnType<typeof createDeliveryDraftHarness>) { deliveryDraft = draft; },
    dispose() {
      deliveryDraft?.unmount();
      workspace.unmount(); app.unmount();
      if (previousFetch === undefined) delete (globalThis as { fetch?: unknown }).fetch;
      else globalThis.fetch = previousFetch;
    },
  };
  app.render(); await app.settle(); await app.login();
  await harness.settle(); workspace.select(routeAId); await harness.settle();
  assert.equal(harness.screen().nextDeliveryStopId, stopAId);
  return harness;
}

describe('Connected notification navigation preserves active work', () => {
  it('continues editing on the current route and leaves the click pending after the editor closes', async () => {
    const h = await connectedWorkspace();
    try {
      const draft = createDeliveryDraftHarness(h.screen());
      h.attachDeliveryDraft(draft); draft.render(); await draft.settle();
      const edit = draft.find((element) => element.props.accessibilityLabel === '배송 순서 편집');
      assert.ok(edit); (edit.props.onPress as () => void)();
      await h.settle();
      const editor = () => draft.find((element) => typeof element.type === 'function' && element.type.name === 'OrderSequenceEditor');
      assert.ok(editor());
      (editor()!.props.onDrop as (destinationId: string, index: number) => void)('destination-A', 1);
      draft.render(); await draft.settle();
      const draftIds = () => (editor()!.props.orders as ScreenProps['orders']).map(({ id }) => id);
      assert.deepEqual(draftIds(), [stopASecondId, stopAId]);
      const reads = h.snapshotReads();
      h.app.receive(); await h.settle();
      assert.deepEqual(draftIds(), [stopASecondId, stopAId]);
      assert.deepEqual(h.snapshotReads(), reads);
      h.app.click(click); await h.settle();
      assert.ok(h.app.hasText('현재 작업 계속'));
      assert.ok(h.app.hasText('알림으로 이동'));
      assert.equal(h.app.workspace()?.notificationDestination, undefined);
      assert.deepEqual(h.snapshotReads(), reads);
      assert.equal(h.screen().isEditing, true);
      assert.deepEqual(draftIds(), [stopASecondId, stopAId]);
      assert.deepEqual(h.screen().orders.map(({ id }) => id), [stopAId, stopASecondId]);
      h.app.pressText('현재 작업 계속'); await h.settle();
      assert.ok(h.app.hasText('보류된 알림'));
      assert.equal(h.screen().isEditing, true);
      assert.deepEqual(draftIds(), [stopASecondId, stopAId]);
      (editor()!.props.onCancel as () => void)(); await h.settle();
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.ok(h.reads.routes.every((id) => id === routeAId));
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      assert.equal(h.app.clearedNativeResponses, 0);
      assert.ok(h.app.storage.snapshot().some((saved) => saved.includes(notificationId) && saved.includes('pending')));
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });

  for (const protection of ['sequence save', 'delivery proof'] as const) {
    it(`holds destination reads and OPENED through ${protection}, then follows an explicit move when safe`, async () => {
      const h = await connectedWorkspace();
      try {
        if (protection === 'sequence save') {
          h.screen().onEditingChange(true);
          h.screen().onSequenceSavingChange(true);
        } else h.executionLock.current = true;
        h.workspace.render(); await h.settle();
        const reads = h.snapshotReads();
        h.app.click(click); await h.settle();
        h.app.pressText('알림으로 이동'); await h.settle();
        assert.equal(h.app.workspace()?.notificationDestination, undefined);
        assert.deepEqual(h.snapshotReads(), reads);
        assert.equal(h.app.resolutions.length, 0);
        assert.equal(h.app.acknowledgements.length, 0);
        assert.equal(h.screen().nextDeliveryStopId, stopAId);
        if (protection === 'sequence save') {
          h.screen().onSequenceSavingChange(false);
          h.screen().onEditingChange(false);
        } else h.executionLock.current = false;
        h.workspace.render(); await h.settle();
        assert.equal(h.app.resolutions.length, 1);
        assert.equal(h.screen().nextDeliveryStopId, stopBId);
        assert.equal(h.app.acknowledgements.filter(({ kind }) => kind === 'OPENED').length, 1);
        assert.equal(h.app.clearedNativeResponses, 1);
        assert.equal(h.businessPosts.length, 0);
      } finally { h.dispose(); }
    });
  }

  it('keeps the real delivery proof and pending photo upload until the user closes proof before moving', async () => {
    const upload = deferred<void>();
    const uploads: DriverProofPhotoUpload[] = [];
    const h = await connectedWorkspace({ realExecution: true, syntheticStopCompletion: true, proofApi: {
      uploadDriverProofPhoto: async (_token: string, input: DriverProofPhotoUpload) => {
        uploads.push(input); await upload.promise;
      },
    } });
    try {
      assert.equal(h.workspace.controller?.executionState.phase, 'idle');
      h.workspace.controller!.confirmDeliveryCompletion();
      h.workspace.pressDialog('완료'); await h.settle();
      assert.equal(h.workspace.controller?.executionState.phase, 'proof');
      assert.equal(h.workspace.controller?.executionState.proof?.deliveryStopId, stopAId);
      assert.equal(h.workspace.controller?.isLocked, true);
      assert.equal(h.businessPosts.length, 1);
      const uploading = h.workspace.controller!.uploadProof({
        fileName: 'synthetic-proof-A.jpg', mimeType: 'image/jpeg', source: 'camera', uri: 'synthetic://proof-A.jpg',
      });
      await h.settle();
      assert.equal(uploads.length, 1);
      assert.equal(uploads[0]!.deliveryStopId, stopAId);
      assert.equal(uploads[0]!.routePlanId, routeAId);
      const reads = h.snapshotReads();
      h.app.click(click); await h.settle();
      h.app.pressText('알림으로 이동'); await h.settle();
      assert.equal(h.workspace.controller?.executionState.phase, 'proof');
      assert.equal(h.workspace.controller?.executionState.proof?.deliveryStopId, stopAId);
      assert.equal(h.workspace.controller?.isLocked, true);
      assert.equal(h.app.workspace()?.notificationDestination, undefined);
      assert.deepEqual(h.snapshotReads(), reads);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      assert.equal(h.businessPosts.length, 1);
      upload.resolve(); await uploading; await h.settle();
      assert.equal(h.workspace.controller?.executionState.phase, 'proof');
      assert.equal(h.app.resolutions.length, 0);
      h.workspace.controller!.closeProofDelivery(); h.workspace.render(); await h.settle();
      assert.equal(h.workspace.controller?.executionState.phase, 'idle');
      assert.equal(h.screen().nextDeliveryStopId, stopBId);
      assert.equal(h.app.resolutions.length, 1);
      assert.equal(h.app.acknowledgements.filter(({ kind }) => kind === 'OPENED').length, 1);
      assert.equal(h.businessPosts.length, 1);
    } finally { upload.resolve(); h.dispose(); }
  });

  for (const status of [403, 409, 410]) {
    it(`resolves an explicitly deferred destination again and handles HTTP ${status} without losing the current route`, async () => {
      const initial = deferred<DriverNotificationResolution>();
      let attempts = 0;
      const h = await connectedWorkspace({ resolver: async () => {
        attempts += 1;
        if (attempts === 1) return initial.promise;
        throw new DriverOperationalApiError(status, status === 410 ? 'EXPIRED' : 'ASSIGNMENT_CHANGED');
      } });
      try {
        h.app.click(click); await h.app.settle();
        assert.equal(h.app.resolutions.length, 1);
        h.executionLock.current = true; h.workspace.render(); await h.settle();
        const reads = h.snapshotReads();
        initial.resolve(destination); await h.settle();
        assert.equal(h.app.workspace()?.notificationDestination, undefined);
        assert.deepEqual(h.snapshotReads(), reads);
        h.app.pressText('알림으로 이동'); await h.settle();
        assert.equal(h.app.resolutions.length, 1);
        h.executionLock.current = false; h.workspace.render(); await h.settle();
        assert.equal(h.app.resolutions.length, 2);
        assert.match(String(h.app.find('Notice')?.props.message), /취소|재배정|만료/u);
        assert.equal(h.screen().nextDeliveryStopId, stopAId);
        assert.ok(h.reads.routes.every((id) => id === routeAId));
        assert.equal(h.app.acknowledgements.length, 0);
        assert.equal(h.app.clearedNativeResponses, 0);
        assert.equal(h.businessPosts.length, 0);
      } finally { initial.resolve(destination); h.dispose(); }
    });
  }

  it('receives foreground notifications without refreshing routes, discarding edits, or sending business commands', async () => {
    const h = await connectedWorkspace();
    try {
      h.screen().onEditingChange(true); h.workspace.render(); await h.settle();
      const reads = h.snapshotReads();
      const refreshRequestKey = h.app.workspace()?.refreshRequestKey;
      h.app.receive(); await h.settle();
      assert.deepEqual(h.snapshotReads(), reads);
      assert.equal(h.app.workspace()?.refreshRequestKey, refreshRequestKey);
      assert.equal(h.screen().isEditing, true);
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });

  it('blocks a delayed GET synchronously when editing starts before React commits the editing state', async () => {
    const pending = deferred<DriverDeliveryRoute>();
    const started = deferred<void>();
    let refreshing = false;
    const h = await connectedWorkspace({ loadRoute: async (id) => {
      if (refreshing && id === routeAId) { started.resolve(); return pending.promise; }
      return id === routeAId ? routeA : routeB;
    } });
    try {
      const draft = createDeliveryDraftHarness(h.screen());
      h.attachDeliveryDraft(draft); draft.render(); await draft.settle();
      refreshing = true;
      h.screen().onRefresh(); h.workspace.render(); await h.workspace.settle();
      assert.ok(h.reads.routes.length > 1, 'The delayed refresh GET must have started');
      await started.promise;
      const edit = draft.find((element) => element.props.accessibilityLabel === '배송 순서 편집');
      assert.ok(edit); (edit.props.onPress as () => void)();
      // Resolve before rendering Workspace: an effect-only guard observes the previous false state.
      pending.resolve({ ...routeA, orders: [...routeA.orders].reverse(), nextDeliveryStopId: stopASecondId });
      await new Promise<void>((resolve) => setImmediate(resolve));
      await h.settle();
      assert.equal(h.screen().isEditing, true);
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.deepEqual(h.screen().orders.map(({ id }) => id), [stopAId, stopASecondId]);
      const editor = draft.find((element) => typeof element.type === 'function' && element.type.name === 'OrderSequenceEditor');
      assert.ok(editor);
      assert.deepEqual((editor.props.orders as ScreenProps['orders']).map(({ id }) => id), [stopAId, stopASecondId]);
      assert.equal(h.businessPosts.length, 0);
    } finally { pending.resolve(routeA); h.dispose(); }
  });

  it('protects an actual completion confirmation dialog and requires an explicit notification choice after cancel', async () => {
    const h = await connectedWorkspace({ realExecution: true });
    try {
      h.workspace.controller!.confirmDeliveryCompletion(); await h.settle();
      assert.ok(h.workspace.controller?.dialog);
      assert.equal(h.workspace.controller?.executionState.phase, 'idle');
      assert.equal(h.workspace.controller?.isLocked, true);
      const reads = h.snapshotReads();
      h.app.click(click); await h.settle();
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.workspace()?.notificationDestination, undefined);
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.deepEqual(h.snapshotReads(), reads);
      assert.equal(h.app.acknowledgements.length, 0);
      h.workspace.pressDialog('취소'); await h.settle();
      assert.equal(h.workspace.controller?.dialog, null);
      assert.equal(h.workspace.controller?.isLocked, false);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.equal(h.businessPosts.length, 0);
      h.app.pressText('알림으로 이동'); await h.settle();
      assert.equal(h.screen().nextDeliveryStopId, stopBId);
      assert.equal(h.app.acknowledgements.filter(({ kind }) => kind === 'OPENED').length, 1);
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });

  it('clears the first click storage error before a second click can expose and acknowledge its destination', async () => {
    const values = new Map<string, string>();
    let failed = false;
    const visibleAcknowledgements: boolean[] = [];
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        const parsed = JSON.parse(value) as { pending?: { notificationId: string }[] };
        if (!failed && parsed.pending?.some((item) => item.notificationId === notificationId)) {
          failed = true; throw new Error('Synthetic first-click storage failure');
        }
        values.set(key, value);
      },
      removeItem: async (key: string) => { values.delete(key); },
      snapshot: () => [...values.values()],
    };
    const h = await connectedWorkspace({ appStorage: storage, acknowledge: async () => {
      visibleAcknowledgements.push(h.app.workspace()?.isVisible === true);
    } });
    try {
      h.app.click(click); await h.settle();
      assert.ok(h.app.find('Notice'));
      assert.equal(h.app.workspace()?.isVisible, false);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      h.app.click(click); await h.app.settle();
      assert.equal(h.app.find('Notice'), undefined);
      assert.equal(h.app.workspace()?.isVisible, true);
      assert.equal(h.app.workspace()?.notificationDestination?.routePlanId, routeBId);
      assert.equal(h.app.acknowledgements.length, 0);
      await h.settle();
      assert.equal(h.screen().nextDeliveryStopId, stopBId);
      assert.deepEqual(visibleAcknowledgements, [true]);
      assert.equal(h.app.acknowledgements.filter(({ kind }) => kind === 'OPENED').length, 1);
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });

  it('releases synchronous protection after an empty retry queue finishes before the refresh render', async () => {
    const h = await connectedWorkspace();
    try {
      h.screen().onRefresh();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await h.settle();
      h.app.click(click); await h.settle();
      assert.equal(h.app.resolutions.length, 1);
      assert.equal(h.app.hasText('현재 작업 계속'), false);
      assert.equal(h.screen().nextDeliveryStopId, stopBId);
      assert.equal(h.app.acknowledgements.filter(({ kind }) => kind === 'OPENED').length, 1);
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });

  it('accepts a legacy handoff click only after the refreshed current route is visible', async () => {
    const h = await connectedWorkspace();
    const pendingCount = () => h.app.storage.snapshot().reduce((count, value) => {
      const stored = JSON.parse(value) as { pending?: unknown[] };
      return count + (stored.pending?.length ?? 0);
    }, 0);
    try {
      h.app.click({ kind: 'bundle_handoff', notificationId: 'legacy-id', handoffRequestId: 'handoff-id' });
      await h.app.settle();
      assert.equal(h.app.workspace()?.notificationRefreshId, 'legacy-id');
      assert.equal(pendingCount(), 1);
      assert.equal(h.app.clearedNativeResponses, 0);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      await h.settle();
      assert.equal(h.app.workspace()?.isVisible, true);
      assert.equal(h.screen().nextDeliveryStopId, stopAId);
      assert.ok(h.reads.routes.every((id) => id === routeAId));
      assert.equal(pendingCount(), 0);
      assert.equal(h.app.clearedNativeResponses, 1);
      assert.equal(h.app.resolutions.length, 0);
      assert.equal(h.app.acknowledgements.length, 0);
      assert.equal(h.businessPosts.length, 0);
    } finally { h.dispose(); }
  });
});
