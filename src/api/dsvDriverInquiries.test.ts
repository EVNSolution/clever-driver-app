import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  createDriverInquiry,
  DriverInquiryApiError,
  getDriverInquiry,
  listDriverInquiries,
} from './dsvDriverInquiries';

const originalFetch = globalThis.fetch;
const originalBase = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
const inquiry = {
  id: '22222222-2222-4222-8222-222222222222', title: '배송 문의', body: '확인 부탁드립니다.',
  authorName: '테스트 배송원', createdAt: '2026-09-07T01:00:00.000Z',
};
const requestId = '11111111-1111-4111-8111-111111111111';
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data, error: null }), { status });

describe('Driver inquiry API contract', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
    else process.env.EXPO_PUBLIC_DSV_API_BASE_URL = originalBase;
  });

  it('uses the account token, sends only trimmed content and preserves the supplied idempotency key', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    const calls: RequestInit[] = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://dsv.example.test/api/dsv/driver/inquiries');
      calls.push(init!);
      return response({ inquiry, duplicate: calls.length > 1 }, calls.length > 1 ? 200 : 201);
    };
    const draft = { title: ' 배송 문의 ', body: ' 확인 부탁드립니다. ' };
    assert.deepEqual(await createDriverInquiry('account-token', draft, requestId), inquiry);
    assert.deepEqual(await createDriverInquiry('account-token', draft, requestId), inquiry);
    for (const call of calls) {
      assert.equal(call.method, 'POST');
      const headers = new Headers(call.headers);
      assert.equal(headers.get('Authorization'), 'Bearer account-token');
      assert.equal(headers.get('Idempotency-Key'), requestId);
      assert.deepEqual(JSON.parse(call.body as string), { title: inquiry.title, body: inquiry.body });
    }
  });

  it('keeps the opaque cursor and server ordering, and uses the authenticated detail endpoint', async () => {
    const urls: string[] = [];
    const older = { ...inquiry, id: '33333333-3333-4333-8333-333333333333', createdAt: '2026-09-06T01:00:00Z' };
    globalThis.fetch = async (url, init) => {
      urls.push(String(url));
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer account-token');
      return String(url).includes('?') ? response({ items: [inquiry, older], nextCursor: 'cursor+/?=' }) : response({ inquiry });
    };
    assert.deepEqual(await listDriverInquiries('account-token', 'cursor+/?='), { items: [inquiry, older], nextCursor: 'cursor+/?=' });
    assert.match(urls[0]!, /limit=20&cursor=cursor%2B%2F%3F%3D$/u);
    assert.deepEqual(await getDriverInquiry('account-token', inquiry.id), inquiry);
    assert.ok(urls[1]!.endsWith(`/inquiries/${inquiry.id}`));
  });

  it('preserves error codes without exposing server messages and rejects malformed successful envelopes', async () => {
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [404, 'NOT_FOUND'], [409, 'IDEMPOTENCY_CONFLICT'], [429, 'RATE_LIMITED']] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ data: null, error: { code, message: 'private diagnostic' } }), { status });
      await assert.rejects(() => getDriverInquiry('token', inquiry.id), (error) => error instanceof DriverInquiryApiError && error.code === code && !error.message.includes('private diagnostic'));
    }
    for (const data of [{ items: [inquiry] }, { items: [{ ...inquiry, createdAt: 'bad' }], nextCursor: null }, { items: [{ ...inquiry, createdAt: 'September 7, 2026' }], nextCursor: null }, { items: null, nextCursor: null }]) {
      globalThis.fetch = async () => response(data);
      await assert.rejects(() => listDriverInquiries('token'), (error) => error instanceof DriverInquiryApiError && error.code === 'INVALID_RESPONSE');
    }
    globalThis.fetch = async () => new Response('<html>unavailable</html>', { status: 503 });
    await assert.rejects(() => listDriverInquiries('token'), (error) => error instanceof DriverInquiryApiError && error.code === 'HTTP_503');
  });

  it('validates form limits before a request and cancels requests with the supplied signal', async () => {
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    await assert.rejects(() => createDriverInquiry('token', inquiry, 'not-a-uuid'), (error) => error instanceof DriverInquiryApiError && error.code === 'BAD_REQUEST');
    for (const draft of [{ title: ' ', body: 'body' }, { title: 'a'.repeat(121), body: 'body' }, { title: 'title', body: 'b'.repeat(4001) }]) {
      await assert.rejects(() => createDriverInquiry('token', draft, requestId), (error) => error instanceof DriverInquiryApiError && error.code === 'BAD_REQUEST');
    }
    const controller = new AbortController();
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const pending = listDriverInquiries('token', undefined, controller.signal);
    controller.abort();
    await assert.rejects(() => pending, (error) => error instanceof DriverInquiryApiError && error.code === 'CANCELLED');
  });

  it('times out a stalled submission without creating another request identity', async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    globalThis.fetch = async (_url, init) => {
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'), requestId);
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    };
    const pending = createDriverInquiry('token', inquiry, requestId);
    context.mock.timers.tick(20_000);
    await assert.rejects(() => pending, (error) => error instanceof DriverInquiryApiError && error.code === 'REQUEST_TIMEOUT');
  });
});
