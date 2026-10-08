import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import * as queue from '../../../domain/delivery/driverCommandQueue';

type StoreModule = typeof import('./driverCommandStore');
function loadStore(values = new Map<string, string>(), beforeWrite: (key: string) => Promise<void> = async () => undefined) {
  const source = readFileSync(new URL('./driverCommandStore.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module, exports: module.exports, Promise, JSON,
    require: (name: string) => {
      if (name === '../../../domain/delivery/driverCommandQueue') return queue;
      assert.equal(name, '@react-native-async-storage/async-storage');
      return { __esModule: true, default: {
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => { await beforeWrite(key); values.set(key, value); },
      } };
    },
  });
  return { ...module.exports as StoreModule, values };
}

const draftKey = 'account:execution:epoch:generation:version-id:1:stop';
test('production storage serializes draft writes before reads and restores unsubmitted text after restart', async () => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  const first = loadStore(new Map(), async () => { if (++writes === 1) await delayed; });
  const one = first.saveDriverDeliveryExceptionDraft(draftKey, '첫 내용');
  const two = first.saveDriverDeliveryExceptionDraft(draftKey, '  나중 내용\n연락\t필요  ');
  const read = first.loadDriverDeliveryExceptionDraft(draftKey);
  release(); await Promise.all([one, two]);
  assert.equal(await read, '  나중 내용\n연락\t필요  ');
  const restarted = loadStore(first.values);
  assert.equal(await restarted.loadDriverDeliveryExceptionDraft(draftKey), '  나중 내용\n연락\t필요  ');
  assert.equal(await restarted.loadDriverDeliveryExceptionDraft(`other-${draftKey}`), '');
  assert.equal((await restarted.createDriverCommandStore().load()).length, 0);
});

test('over-limit unsent input remains editable after restart and is not discarded by storage', async () => {
  const first = loadStore();
  const text = '잘못 붙여넣은 내용'.repeat(3_000);
  await first.saveDriverDeliveryExceptionDraft(draftKey, text);
  assert.equal(await loadStore(first.values).loadDriverDeliveryExceptionDraft(draftKey), text);
  await first.saveDriverDeliveryExceptionDraft(draftKey, '수정한 사유');
  assert.equal(await loadStore(first.values).loadDriverDeliveryExceptionDraft(draftKey), '수정한 사유');
});

test('production storage keeps legacy v1 commands and their full original payload unchanged', async () => {
  const command: queue.DriverQueuedCommand = {
    accountId: '11111111-1111-4111-8111-111111111111', attempts: 1,
    executionContextId: '22222222-2222-4222-8222-222222222222', lastError: 'NETWORK_ERROR', status: 'pending',
    type: 'REPORT_DELIVERY_EXCEPTION', payload: {
      assignmentEpoch: '1', assignmentGeneration: '2', commandId: '33333333-3333-4333-8333-333333333333',
      expectedRouteVersionId: '44444444-4444-4444-8444-444444444444', occurredAt: '2026-10-07T01:00:00.000Z',
      routeVersion: 3, targetStopId: '55555555-5555-4555-8555-555555555555', reasonCode: 'LEGACY_REASON', explanation: '기존 내용',
    },
  };
  const values = new Map([['clever-driver.operational-commands.v1', JSON.stringify([command])]]);
  const store = loadStore(values).createDriverCommandStore();
  assert.deepEqual(await store.load(), [command]);
  await store.save(await store.load());
  assert.equal(values.get('clever-driver.operational-commands.v1'), JSON.stringify([command]));
});

test('corrupt draft storage fails visibly and does not erase the stored value', async () => {
  for (const saved of ['{broken', '{"reason":"unexpected shape"}']) {
    const values = new Map([[`clever-driver.delivery-exception-draft.v1:${draftKey}`, saved]]);
    await assert.rejects(loadStore(values).loadDriverDeliveryExceptionDraft(draftKey), /STORAGE_INVALID/);
    assert.equal(values.get(`clever-driver.delivery-exception-draft.v1:${draftKey}`), saved);
  }
});
