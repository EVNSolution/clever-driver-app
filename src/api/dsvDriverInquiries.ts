import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverInquiry = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
};
export type DriverInquiryPage = { items: DriverInquiry[]; nextCursor: string | null };

export class DriverInquiryApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DriverInquiryApiError';
  }
}

const endpoint = '/api/dsv/driver/inquiries';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function isInquiry(value: unknown): value is DriverInquiry {
  return isObject(value)
    && ['id', 'title', 'body', 'authorName', 'createdAt'].every((key) => typeof value[key] === 'string')
    && (value.id as string).length > 0
    && isoUtcPattern.test(value.createdAt as string)
    && Number.isFinite(Date.parse(value.createdAt as string));
}

// Keep the same caller-owned request key when a response is lost or times out.
async function request(path: string, accessToken: string, init: RequestInit, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    if (controller.signal.aborted) throw new DriverInquiryApiError('CANCELLED');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(resolveDsvApiUrl(path), { ...init, headers, signal: controller.signal });
    const envelope: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isObject(envelope) && isObject(envelope.error) ? envelope.error : null;
      throw new DriverInquiryApiError(typeof error?.code === 'string' ? error.code : `HTTP_${response.status}`);
    }
    if (!isObject(envelope) || !isObject(envelope.data)) throw new DriverInquiryApiError('INVALID_RESPONSE');
    return envelope.data;
  } catch (error) {
    if (timedOut) throw new DriverInquiryApiError('REQUEST_TIMEOUT');
    if (signal?.aborted) throw new DriverInquiryApiError('CANCELLED');
    if (error instanceof DriverInquiryApiError) throw error;
    throw new DriverInquiryApiError('NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function listDriverInquiries(accessToken: string, cursor?: string, signal?: AbortSignal): Promise<DriverInquiryPage> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor !== undefined) query.set('cursor', cursor);
  const data = await request(`${endpoint}?${query}`, accessToken, { method: 'GET' }, signal);
  if (!Array.isArray(data.items) || !data.items.every(isInquiry)
    || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) {
    throw new DriverInquiryApiError('INVALID_RESPONSE');
  }
  return { items: data.items, nextCursor: data.nextCursor };
}

export async function getDriverInquiry(accessToken: string, id: string, signal?: AbortSignal): Promise<DriverInquiry> {
  const data = await request(`${endpoint}/${encodeURIComponent(id)}`, accessToken, { method: 'GET' }, signal);
  if (!isInquiry(data.inquiry) || data.inquiry.id !== id) throw new DriverInquiryApiError('INVALID_RESPONSE');
  return data.inquiry;
}

export async function createDriverInquiry(accessToken: string, draft: { title: string; body: string }, requestId: string, signal?: AbortSignal): Promise<DriverInquiry> {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!uuidPattern.test(requestId) || title.length < 1 || title.length > 120 || body.length < 1 || body.length > 4000) {
    throw new DriverInquiryApiError('BAD_REQUEST');
  }
  const data = await request(endpoint, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
    body: JSON.stringify({ title, body }),
  }, signal);
  if (!isInquiry(data.inquiry) || typeof data.duplicate !== 'boolean') throw new DriverInquiryApiError('INVALID_RESPONSE');
  return data.inquiry;
}
