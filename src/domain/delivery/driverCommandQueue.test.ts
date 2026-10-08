import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DriverCommandQueue,
  DriverCommandQueueError,
  parseStoredDriverCommands,
  type DriverCommandAcknowledgement,
  type DriverCommandContext,
  type DriverCommandSession,
  type DriverCommandStore,
  type DriverQueuedCommand,
} from './driverCommandQueue';

const accountId = '11111111-1111-4111-8111-111111111111';
const otherAccountId = '22222222-2222-4222-8222-222222222222';
const context: DriverCommandContext = {
  assignmentEpoch: '3',
  assignmentGeneration: '5',
  executionContextId: '33333333-3333-4333-8333-333333333333',
  expectedRouteVersionId: '44444444-4444-4444-8444-444444444444',
  routeVersion: 2,
  startedAt: null,
  status: 'ACTIVE',
};
const report = {
  reasonCode: 'SYNTHETIC_REASON',
  targetStopId: '55555555-5555-4555-8555-555555555555',
};

function memoryStore(): DriverCommandStore & { saved: DriverQueuedCommand[] } {
  return {
    saved: [],
    async load() { return structuredClone(this.saved); },
    async save(commands) { this.saved = structuredClone([...commands]); },
  };
}

function acknowledge(command: DriverQueuedCommand): DriverCommandAcknowledgement {
  return {
    assignmentEpoch: command.payload.assignmentEpoch,
    commandId: command.payload.commandId,
    executionContextId: command.executionContextId,
    routeVersion: command.payload.routeVersion,
  };
}

function harness(store = memoryStore()) {
  let nextId = 0;
  const state = {
    authenticationRequests: [] as DriverCommandSession[],
    contexts: [{ ...context }] as DriverCommandContext[],
    failSave: false,
    session: { accountId, generation: 1 } as DriverCommandSession | null,
    sends: [] as DriverQueuedCommand[],
    send: async (command: DriverQueuedCommand) => acknowledge(command),
  };
  const makeQueue = () => new DriverCommandQueue({
    createCommandId: () => `66666666-6666-4666-8666-${String(++nextId).padStart(12, '0')}`,
    getSession: () => state.session,
    loadContexts: async () => state.contexts,
    now: () => '2026-10-07T00:00:00.000Z',
    onAuthenticationRequired: (session) => { state.authenticationRequests.push(session); },
    send: async (command) => {
      assert.ok(store.saved.some((saved) => saved.payload.commandId === command.payload.commandId));
      state.sends.push(structuredClone(command));
      return state.send(command);
    },
    store: {
      load: () => store.load(),
      save: async (commands) => {
        if (state.failSave) throw new Error('storage failure');
        await store.save(commands);
      },
    },
  });
  return { makeQueue, queue: makeQueue(), state, store };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('durable driver commands', () => {
  it('persists before sending and confirms only a matching server acknowledgement', async () => {
    const { queue, store, state } = harness();
    const result = await queue.enqueueStart(context);
    assert.equal(result.status, 'confirmed');
    assert.equal(state.sends.length, 1);
    assert.equal(store.saved[0].status, 'confirmed');
    assert.deepEqual(state.sends[0].payload, {
      assignmentEpoch: '3', assignmentGeneration: '5',
      commandId: '66666666-6666-4666-8666-000000000001',
      expectedRouteVersionId: context.expectedRouteVersionId,
      occurredAt: '2026-10-07T00:00:00.000Z', routeVersion: 2,
    });
  });

  it('replays the identical command after response loss, process restart, and an already-started context', async () => {
    const { queue, makeQueue, state } = harness();
    state.send = async () => { throw new TypeError('response lost'); };
    const pending = await queue.enqueueStart(context);
    assert.equal(pending.status, 'pending');
    state.contexts = [{ ...context, startedAt: '2026-10-07T00:00:00.000Z' }];
    state.send = async (command) => acknowledge(command);
    const restarted = makeQueue();
    await restarted.retryPending();
    assert.deepEqual(state.sends[0].payload, state.sends[1].payload);
    assert.equal(restarted.listForAccount(accountId)[0].status, 'confirmed');
  });

  it('keeps offline and server-failure commands pending and deduplicates repeated user start/report input', async () => {
    const { queue, state } = harness();
    state.send = async () => { throw Object.assign(new Error(), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 }); };
    const firstStart = await queue.enqueueStart(context);
    const repeatedStart = await queue.enqueueStart(context);
    assert.equal(repeatedStart.payload.commandId, firstStart.payload.commandId);
    const firstReport = await queue.enqueueDeliveryException(context, report);
    const repeatedReport = await queue.enqueueDeliveryException(context, report);
    assert.equal(repeatedReport.payload.commandId, firstReport.payload.commandId);
    assert.equal(queue.listForAccount(accountId).length, 2);
    assert.equal(firstStart.status, 'pending');
    assert.equal(firstReport.status, 'pending');
  });

  it('restores a free-text report verbatim after response loss and process restart', async () => {
    const { queue, makeQueue, state, store } = harness();
    const details = { targetStopId: report.targetStopId, reason: '수취인 부재\n연락\t시도' };
    state.send = async () => { throw new TypeError('response lost after commit'); };
    const pending = await queue.enqueueDeliveryException(context, details);
    assert.equal(pending.status, 'pending');
    const originalBody = structuredClone(pending.payload);
    assert.deepEqual(parseStoredDriverCommands(JSON.parse(JSON.stringify(store.saved)))[0].payload, originalBody);
    state.send = async (command) => acknowledge(command);
    const restarted = makeQueue(); await restarted.retryPending();
    assert.deepEqual(state.sends.map(({ payload }) => payload), [originalBody, originalBody]);
    assert.equal(restarted.listForAccount(accountId)[0].status, 'confirmed');
    assert.equal('reasonCode' in originalBody, false);
  });

  it('keeps a saved legacy reasonCode and explanation unchanged across upgrade and retry', async () => {
    const { queue, makeQueue, state, store } = harness();
    state.send = async () => { throw new TypeError('offline'); };
    await queue.enqueueDeliveryException(context, { ...report, explanation: '기존 내용' });
    const originalBody = structuredClone(store.saved[0].payload);
    state.send = async (command) => acknowledge(command);
    const restarted = makeQueue(); await restarted.retryPending();
    assert.deepEqual(state.sends[1].payload, originalBody);
    assert.equal('reason' in state.sends[1].payload, false);
  });

  it('does no work when the queue is empty or on initialization and list reads', async () => {
    const { queue, state } = harness();
    await queue.initialize();
    queue.listForAccount(accountId);
    await queue.retryPending();
    assert.equal(state.sends.length, 0);
  });

  for (const [field, replacement] of [
    ['assignmentEpoch', '4'],
    ['assignmentGeneration', '6'],
    ['expectedRouteVersionId', '77777777-7777-4777-8777-777777777777'],
    ['routeVersion', 3],
  ] as const) {
    it(`blocks an old command when ${field} changes`, async () => {
      const { queue, state } = harness();
      state.send = async () => { throw new TypeError('offline'); };
      await queue.enqueueStart(context);
      state.contexts = [{ ...context, [field]: replacement }];
      await queue.retryPending();
      assert.equal(state.sends.length, 1);
      assert.equal(queue.listForAccount(accountId)[0].status, 'blocked');
      assert.equal(queue.listForAccount(accountId)[0].lastError, 'FENCE_CHANGED');
    });
  }

  it('blocks a missing, completed, or cancelled execution without submitting a command', async () => {
    for (const contexts of [[], [{ ...context, status: 'COMPLETED' }], [{ ...context, status: 'CANCELLED' }]]) {
      const { queue, state } = harness();
      state.contexts = contexts;
      const result = await queue.enqueueStart(context);
      assert.equal(result.status, 'blocked');
      assert.equal(result.lastError, 'CONTEXT_NOT_AVAILABLE');
      assert.equal(state.sends.length, 0);
    }
  });

  it('keeps commands from another account out of retry and UI data', async () => {
    const { queue, state, makeQueue } = harness();
    state.send = async () => { throw new TypeError('offline'); };
    await queue.enqueueStart(context);
    state.session = { accountId: otherAccountId, generation: 2 };
    const restarted = makeQueue();
    await restarted.retryPending();
    assert.equal(state.sends.length, 1);
    assert.deepEqual(restarted.listForAccount(accountId), []);
    assert.deepEqual(restarted.listForAccount(otherAccountId), []);
  });

  it('blocks an in-flight command on logout and ignores the late server response', async () => {
    const { queue, state, store } = harness();
    const response = deferred<DriverCommandAcknowledgement>();
    const sent = deferred<DriverQueuedCommand>();
    state.send = async (command) => { sent.resolve(command); return response.promise; };
    const pendingResult = queue.enqueueStart(context);
    const command = await sent.promise;
    state.session = null;
    await queue.invalidateSession();
    const result = await pendingResult;
    assert.equal(result.status, 'blocked');
    assert.equal(result.lastError, 'SESSION_CHANGED');
    response.resolve(acknowledge(command));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.saved[0].status, 'blocked');
    state.session = { accountId, generation: 3 };
    await queue.retryPending();
    assert.equal(state.sends.length, 1);
  });

  it('ignores a late response after the account generation changes', async () => {
    const { queue, state } = harness();
    const response = deferred<DriverCommandAcknowledgement>();
    const sent = deferred<DriverQueuedCommand>();
    state.send = async (command) => { sent.resolve(command); return response.promise; };
    const resultPromise = queue.enqueueStart(context);
    const command = await sent.promise;
    state.session = { accountId, generation: 2 };
    response.resolve(acknowledge(command));
    assert.equal((await resultPromise).status, 'blocked');
  });

  it('retains definitive authority/conflict/terminal-target rejection without retrying it', async () => {
    for (const code of ['UNAUTHORIZED', 'ASSIGNMENT_CHANGED', 'ROUTE_VERSION_CHANGED', 'TARGET_TERMINAL']) {
      const { queue, state } = harness();
      state.send = async () => { throw Object.assign(new Error(), { code, status: code === 'UNAUTHORIZED' ? 403 : 409 }); };
      const result = await queue.enqueueDeliveryException(context, report);
      assert.equal(result.status, 'blocked');
      assert.equal(result.lastError, code);
      await queue.retryPending();
      assert.equal(state.sends.length, 1);
    }
  });

  it('retains a 401 command for same-account authentication renewal and replays its original body', async () => {
    const { queue, state, store } = harness();
    state.send = async () => { throw Object.assign(new Error(), { code: 'UNAUTHORIZED', status: 401 }); };
    const pending = await queue.enqueueStart(context);
    assert.equal(pending.status, 'pending');
    assert.equal(store.saved[0].status, 'pending');
    assert.deepEqual(state.authenticationRequests, [{ accountId, generation: 1 }]);
    // An access-token renewal leaves the account/login generation unchanged.
    state.send = async (command) => acknowledge(command);
    await queue.retryPending();
    assert.deepEqual(state.sends[0].payload, state.sends[1].payload);
    assert.equal(queue.listForAccount(accountId)[0].status, 'confirmed');
  });

  it('never replays another account\'s 401 command or requests recovery for a late old-session rejection', async () => {
    const { queue, state } = harness();
    state.send = async () => { throw Object.assign(new Error(), { code: 'UNAUTHORIZED', status: 401 }); };
    const pending = await queue.enqueueDeliveryException(context, report);
    assert.equal(pending.status, 'pending');
    state.session = { accountId: otherAccountId, generation: 2 };
    await queue.retryPending();
    assert.equal(state.sends.length, 1);
    assert.deepEqual(queue.listForAccount(otherAccountId), []);

    const second = harness();
    const sent = deferred<void>();
    const rejection = deferred<void>();
    second.state.send = async () => {
      sent.resolve();
      await rejection.promise;
      throw Object.assign(new Error(), { code: 'UNAUTHORIZED', status: 401 });
    };
    const resultPromise = second.queue.enqueueStart(context);
    await sent.promise;
    second.state.session = { accountId: otherAccountId, generation: 2 };
    rejection.resolve();
    assert.equal((await resultPromise).status, 'blocked');
    assert.deepEqual(second.state.authenticationRequests, []);
    await second.queue.retryPending();
    assert.equal(second.state.sends.length, 1);
  });

  it('records a report without creating start, failure, or completion commands', async () => {
    const { queue, state } = harness();
    const result = await queue.enqueueDeliveryException(context, { ...report, explanation: '합성 검증' });
    assert.equal(result.status, 'confirmed');
    assert.deepEqual(state.sends.map((command) => command.type), ['REPORT_DELIVERY_EXCEPTION']);
    assert.equal(state.sends[0].payload.occurredAt, '2026-10-07T00:00:00.000Z');
  });

  it('deduplicates two concurrent report taps even when the first receives an immediate approval', async () => {
    const { queue, state } = harness();
    const [first, second] = await Promise.all([
      queue.enqueueDeliveryException(context, report),
      queue.enqueueDeliveryException(context, report),
    ]);
    assert.equal(first.status, 'confirmed');
    assert.equal(second.payload.commandId, first.payload.commandId);
    assert.equal(state.sends.length, 1);
    const later = await queue.enqueueDeliveryException(context, report);
    assert.notEqual(later.payload.commandId, first.payload.commandId);
  });

  it('retries a mismatched acknowledgement with the original identity and body', async () => {
    const { queue, state } = harness();
    state.send = async (command) => ({ ...acknowledge(command), routeVersion: 999 });
    const result = await queue.enqueueStart(context);
    assert.equal(result.status, 'pending');
    assert.equal(result.lastError, 'INVALID_ACKNOWLEDGEMENT');
    state.send = async (command) => acknowledge(command);
    await queue.retryPending();
    assert.deepEqual(state.sends[0].payload, state.sends[1].payload);
    assert.equal(queue.listForAccount(accountId)[0].status, 'confirmed');
  });

  it('retries invalid HTTP 200/201 response bodies after restart without changing the command', async () => {
    for (const status of [200, 201]) {
      const { queue, state, makeQueue } = harness();
      // DriverOperationalApiError preserves the successful HTTP status when body validation fails.
      state.send = async () => { throw Object.assign(new Error(), { code: 'INVALID_RESPONSE', status }); };
      const result = await queue.enqueueDeliveryException(context, report);
      assert.equal(result.status, 'pending');
      assert.equal(result.lastError, 'INVALID_RESPONSE');
      state.send = async (command) => acknowledge(command);
      const restarted = makeQueue();
      await restarted.retryPending();
      assert.deepEqual(state.sends[0].payload, state.sends[1].payload);
      assert.equal(restarted.listForAccount(accountId)[0].status, 'confirmed');
    }
  });

  it('never sends a command when durable persistence fails', async () => {
    const { queue, state } = harness();
    state.failSave = true;
    await assert.rejects(queue.enqueueStart(context), /storage failure/);
    assert.equal(state.sends.length, 0);
  });

  it('does not confirm when logout occurs while the acknowledgement is being persisted', async () => {
    const store = memoryStore();
    const state = { session: { accountId, generation: 1 } as DriverCommandSession | null };
    const write = deferred<void>();
    const confirming = deferred<void>();
    const queue = new DriverCommandQueue({
      createCommandId: () => '66666666-6666-4666-8666-000000000001',
      getSession: () => state.session,
      loadContexts: async () => [context],
      now: () => '2026-10-07T00:00:00.000Z',
      send: async (command) => acknowledge(command),
      store: {
        load: () => store.load(),
        save: async (commands) => {
          if (commands[0]?.status === 'confirmed') {
            confirming.resolve();
            await write.promise;
          }
          await store.save(commands);
        },
      },
    });
    const resultPromise = queue.enqueueStart(context);
    await confirming.promise;
    state.session = null;
    const invalidation = queue.invalidateSession();
    write.resolve();
    const result = await resultPromise;
    await invalidation;
    assert.equal(result.status, 'blocked');
    assert.equal(store.saved[0].status, 'blocked');
  });

  it('blocks restored pending commands on logout even before retry starts', async () => {
    const { queue, makeQueue, state, store } = harness();
    state.send = async () => { throw new TypeError('offline'); };
    await queue.enqueueStart(context);
    const restored = makeQueue();
    await restored.initialize();
    state.session = null;
    await restored.invalidateSession();
    assert.equal(store.saved[0].status, 'blocked');
  });

  it('permits a new explicit start after login without replaying a cancelled command', async () => {
    const { queue, state } = harness();
    state.send = async () => { throw new TypeError('offline'); };
    const old = await queue.enqueueStart(context);
    state.session = null;
    await queue.invalidateSession();
    state.session = { accountId, generation: 2 };
    state.send = async (command) => acknowledge(command);
    const fresh = await queue.enqueueStart(context);
    assert.equal(fresh.status, 'confirmed');
    assert.notEqual(fresh.payload.commandId, old.payload.commandId);
    assert.equal(queue.listForAccount(accountId)[0].status, 'blocked');
    assert.equal(state.sends.length, 2);
  });

  it('keeps a suspended in-flight command retryable after ordinary unmount/restart', async () => {
    const { queue, state, store, makeQueue } = harness();
    const sent = deferred<DriverQueuedCommand>();
    const response = deferred<DriverCommandAcknowledgement>();
    state.send = async (command) => { sent.resolve(command); return response.promise; };
    const attempt = queue.enqueueStart(context);
    const oldCommand = await sent.promise;
    state.session = null;
    queue.suspendSession();
    assert.equal((await attempt).status, 'pending');
    assert.equal(store.saved[0].status, 'pending');
    response.resolve(acknowledge(oldCommand));
    state.session = { accountId, generation: 1 };
    state.send = async (command) => acknowledge(command);
    const restored = makeQueue();
    await restored.retryPending();
    assert.equal(restored.listForAccount(accountId)[0].status, 'confirmed');
    assert.deepEqual(state.sends[0].payload, state.sends[1].payload);
  });

  it('gives explicit logout cancellation precedence over suspension', async () => {
    const { queue, state, store } = harness();
    const sent = deferred<DriverQueuedCommand>();
    state.send = async (command) => { sent.resolve(command); return new Promise(() => undefined); };
    const attempt = queue.enqueueStart(context);
    await sent.promise;
    queue.suspendSession();
    state.session = null;
    const logout = queue.invalidateSession();
    assert.equal((await attempt).status, 'blocked');
    await logout;
    assert.equal(store.saved[0].status, 'blocked');
  });

  it('bounds storage without discarding pending commands', async () => {
    const { queue, state } = harness();
    state.send = async () => { throw new TypeError('offline'); };
    for (let index = 0; index < 40; index += 1) {
      await queue.enqueueDeliveryException(context, { ...report, reasonCode: `SYNTHETIC_${index}` });
    }
    await assert.rejects(queue.enqueueDeliveryException(context, { ...report, reasonCode: 'SYNTHETIC_OVERFLOW' }),
      (error: unknown) => error instanceof DriverCommandQueueError && error.code === 'QUEUE_FULL');
    assert.equal(queue.listForAccount(accountId).length, 40);
  });

  it('rejects corrupted storage and excludes token/extra fields', async () => {
    const { queue, store } = harness();
    await queue.enqueueStart(context);
    assert.deepEqual(parseStoredDriverCommands(store.saved), store.saved);
    assert.throws(() => parseStoredDriverCommands([{ ...store.saved[0], accessToken: 'never-store' }]));
    assert.throws(() => parseStoredDriverCommands([{ ...store.saved[0], payload: { ...store.saved[0].payload, occurredAt: 'invalid' } }]));
  });
});
