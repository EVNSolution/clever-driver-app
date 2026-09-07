import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as api from '../api/dsvDriverInquiries';

type HookModule = typeof import('../ui/driver/DriverInquiries');
const row: api.DriverInquiry = {
  id: '22222222-2222-4222-8222-222222222222', title: '제목', body: '본문',
  authorName: '서버 작성자', createdAt: '2026-09-07T01:00:00.000Z',
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

// Execute production callbacks and effects. This does not render native gestures/layout.
function harness(overrides: Partial<typeof api> = {}) {
  const client = { ...api, listDriverInquiries: async () => ({ items: [], nextCursor: null }),
    getDriverInquiry: async () => row, createDriverInquiry: async () => row, ...overrides };
  const slots: unknown[] = [];
  type Effect = { deps: unknown[]; setup(): (() => void) | void; cleanup?: (() => void) | void };
  const effects = new Map<number, Effect>();
  const pending: (() => void)[] = [];
  let index = 0;
  let active = true;
  let lateWrites = 0;
  let uuidCounter = 0;
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const dependencies: Record<string, unknown> = {
    react: {
      useRef: (initial: unknown) => { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
      useState: (initial: unknown) => {
        const i = index++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], (value: unknown) => {
          if (!active) lateWrites += 1;
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        }];
      },
      useCallback: (callback: unknown, deps: unknown[]) => {
        const i = index++;
        const old = slots[i] as { callback: unknown; deps: unknown[] } | undefined;
        if (!same(old?.deps, deps)) slots[i] = { callback, deps };
        return (slots[i] as { callback: unknown }).callback;
      },
      useEffect: (setup: Effect['setup'], deps: unknown[]) => {
        const i = index++;
        const old = effects.get(i);
        if (!same(old?.deps, deps)) pending.push(() => {
          old?.cleanup?.();
          effects.set(i, { deps, setup, cleanup: setup() });
        });
      },
    },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-native': { StyleSheet: { create: (styles: unknown) => styles } },
    'react-native-keyboard-controller': {},
    'expo-modules-core': { uuid: { v4: () => `11111111-1111-4111-8111-${String(++uuidCounter).padStart(12, '0')}` } },
    '../../api/dsvDriverInquiries': client,
  };
  const source = readFileSync(new URL('../ui/driver/DriverInquiries.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, AbortController, Error, Date, Intl,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } });
  const hooks = module.exports as HookModule;
  return {
    render(token = 'account-A') {
      index = 0;
      const result = hooks.useDriverInquiries(token);
      pending.splice(0).forEach((run) => run());
      return result;
    },
    replayEffects() {
      for (const effect of effects.values()) effect.cleanup?.();
      for (const effect of effects.values()) effect.cleanup = effect.setup();
    },
    unmount() { active = false; for (const effect of effects.values()) effect.cleanup?.(); },
    get lateWrites() { return lateWrites; },
  };
}

describe('Driver inquiry production controller', () => {
  it('locks double submits, keeps failed input/key, and clears the draft only after server success', async () => {
    const first = deferred<api.DriverInquiry>();
    const keys: string[] = [];
    const h = harness({ createDriverInquiry: async (_token, draft, key) => {
      assert.deepEqual({ ...draft }, { title: '제목', body: '본문' });
      keys.push(key);
      return keys.length === 1 ? first.promise : row;
    } });
    let c = h.render(); await flush(); c = h.render();
    c.showCompose(); c.setTitle(' 제목 '); c.setBody(' 본문 '); c = h.render();
    const sending = c.submit(); await c.submit();
    assert.equal(keys.length, 1);
    first.reject(new api.DriverInquiryApiError('REQUEST_TIMEOUT')); await sending;
    c = h.render();
    assert.equal(c.title, ' 제목 '); assert.equal(c.body, ' 본문 '); assert.ok(c.submitError);
    await c.submit(); await flush(); c = h.render();
    assert.equal(keys[0], keys[1]); assert.equal(c.title, ''); assert.equal(c.body, '');
    assert.equal(c.detail?.authorName, '서버 작성자'); assert.equal(c.view.kind, 'detail');
    c.showCompose(); c.setTitle('제목'); c.setBody('본문'); c = h.render();
    await c.submit(); assert.notEqual(keys[2], keys[1]); h.unmount();
  });

  it('does not let stale pagination overwrite a refresh or leave load-more stuck', async () => {
    const more = deferred<api.DriverInquiryPage>();
    let calls = 0;
    const h = harness({ listDriverInquiries: async (_token, cursor) => {
      calls += 1;
      if (cursor) return more.promise;
      return { items: [{ ...row, title: calls === 1 ? 'original' : 'refreshed' }], nextCursor: calls === 1 ? 'next' : null };
    } });
    let c = h.render(); await flush(); c = h.render();
    const loading = c.loadMore(); void c.loadMore();
    assert.equal(calls, 2);
    c = h.render(); await c.refresh();
    more.resolve({ items: [{ ...row, id: 'old-page' }], nextCursor: 'obsolete' }); await loading;
    c = h.render(); assert.equal(c.inquiries.length, 1); assert.equal(c.inquiries[0]?.title, 'refreshed');
    assert.equal(c.isLoadingMore, false); assert.equal(c.nextCursor, null); h.unmount();
  });

  it('keeps newer details when old requests finish late and aborts all work on unmount', async () => {
    const old = deferred<api.DriverInquiry>();
    const submission = deferred<api.DriverInquiry>();
    const h = harness({ getDriverInquiry: async (_token, id) => id === 'old' ? old.promise : { ...row, id },
      createDriverInquiry: async () => submission.promise });
    let c = h.render(); await flush(); c = h.render();
    const opening = c.openDetail('old'); await c.openDetail('new');
    old.resolve({ ...row, id: 'old' }); await opening; c = h.render();
    assert.equal(c.detail?.id, 'new');
    c.showCompose(); c.setTitle('제목'); c.setBody('본문'); c = h.render();
    const sending = c.submit(); h.unmount(); submission.resolve(row); await sending;
    assert.equal(h.lateWrites, 0);
    const other = harness(); assert.equal(other.render('account-B').inquiries.length, 0); other.unmount();
  });

  it('does not append an old cursor page while the first page is being refreshed', async () => {
    const refreshing = deferred<api.DriverInquiryPage>();
    let calls = 0;
    const h = harness({ listDriverInquiries: async () => {
      calls += 1;
      return calls === 1 ? { items: [row], nextCursor: 'old-cursor' } : refreshing.promise;
    } });
    let c = h.render(); await flush(); c = h.render();
    const request = c.refresh(); void c.loadMore();
    assert.equal(calls, 2);
    refreshing.resolve({ items: [{ ...row, title: 'new first page' }], nextCursor: null }); await request;
    c = h.render(); assert.equal(c.inquiries.length, 1); h.unmount();
  });

  it('keeps an idempotency conflict visible and rotates its key only after an explicit new attempt', async () => {
    const keys: string[] = [];
    const h = harness({ createDriverInquiry: async (_token, _draft, key) => {
      keys.push(key); throw new api.DriverInquiryApiError('IDEMPOTENCY_CONFLICT');
    } });
    let c = h.render(); await flush(); c = h.render();
    c.setTitle('제목'); c.setBody('본문'); c = h.render(); await c.submit(); c = h.render();
    assert.equal(c.hasIdempotencyConflict, true); assert.equal(c.body, '본문');
    c.setBody('수정한 본문'); c = h.render(); await c.submit(); assert.equal(keys[0], keys[1]);
    c.startNewAttempt(); c = h.render(); await c.submit(); assert.notEqual(keys[1], keys[2]); h.unmount();
  });

  it('survives effect replay and keeps the current token request after an old response', async () => {
    const old = deferred<api.DriverInquiryPage>();
    const h = harness({ listDriverInquiries: async (token) => token === 'account-A' ? old.promise : { items: [row], nextCursor: null } });
    h.render(); h.replayEffects(); h.render('account-B'); await flush();
    old.resolve({ items: [{ ...row, title: 'stale account' }], nextCursor: null }); await flush();
    const c = h.render('account-B'); assert.equal(c.inquiries[0]?.title, row.title); h.unmount();
  });

  it('does not let an aborted token-era submission unlock a newer submission', async () => {
    const old = deferred<api.DriverInquiry>();
    const current = deferred<api.DriverInquiry>();
    let calls = 0;
    const h = harness({ createDriverInquiry: async () => {
      calls += 1; return calls === 1 ? old.promise : current.promise;
    } });
    let c = h.render(); await flush(); c = h.render();
    c.setTitle('제목'); c.setBody('본문'); c = h.render();
    const first = c.submit(); h.render('refreshed-token'); await flush(); c = h.render('refreshed-token');
    const second = c.submit(); old.resolve(row); await first;
    void c.submit(); assert.equal(calls, 2);
    current.resolve(row); await second; h.unmount();
  });

  it('reloads an open detail with the refreshed token instead of leaving it loading', async () => {
    const old = deferred<api.DriverInquiry>();
    const tokens: string[] = [];
    const h = harness({ getDriverInquiry: async (token) => {
      tokens.push(token); return token === 'account-A' ? old.promise : { ...row, title: 'new token detail' };
    } });
    let c = h.render(); await flush(); c = h.render();
    const opening = c.openDetail(row.id);
    h.render('refreshed-token'); await flush(); c = h.render('refreshed-token');
    assert.deepEqual(tokens, ['account-A', 'refreshed-token']);
    assert.equal(c.detailState, 'ready'); assert.equal(c.detail?.title, 'new token detail');
    old.resolve({ ...row, title: 'obsolete' }); await opening; c = h.render('refreshed-token');
    assert.equal(c.detail?.title, 'new token detail');
    c.showList(); c.showCompose(); h.render('another-refresh'); await flush();
    assert.equal(h.render('another-refresh').view.kind, 'compose'); assert.equal(tokens.length, 2); h.unmount();
  });

  it('keys the settings state by account and keeps the inquiry content in one keyboard-aware native modal', () => {
    const read = (name: string) => readFileSync(new URL(`../ui/driver/${name}`, import.meta.url), 'utf8');
    assert.match(read('DriverWorkspace.tsx'), /<DriverSettingsModal\b[^>]*\bkey=\{authSession\.account\.id\}/u);
    const screen = read('DriverInquiries.tsx');
    assert.match(screen, /KeyboardAwareScrollView/u);
    assert.doesNotMatch(screen, /<Modal|numberOfLines=|dangerouslySetInnerHTML/u);
    assert.match(screen, /authorName/u); assert.match(screen, /createdAt/u);
  });
});
