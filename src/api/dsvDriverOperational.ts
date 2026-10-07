import { isDriverOperationalUuid as isUuid } from '../domain/notifications/driverOperationalIdentity';
import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverOperationalNotificationKind = 'N01' | 'N02' | 'N03' | 'N04' | 'N05' | 'N06';

export type DriverExecutionContext = {
  executionContextId: string;
  routePlanId: string;
  routeVersion: number;
  assignmentEpoch: string;
  assignmentGeneration: string;
  expectedRouteVersionId: string;
  serviceDate: string;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  startedAt: string | null;
};

export type DriverOperationalCommandInput = {
  commandId: string;
  occurredAt: string;
  routeVersion: number;
  assignmentEpoch: string;
  assignmentGeneration: string;
  expectedRouteVersionId: string;
};

export type DriverDeliveryExceptionInput = DriverOperationalCommandInput & {
  targetStopId: string;
  reasonCode: string;
  explanation?: string | null;
};

export type DriverStartExecutionResult = {
  assignmentEpoch: string;
  commandId: string;
  duplicate: boolean;
  executionContextId: string;
  pickupCompletedEventId: string;
  routeStartedEventId: string;
  routeVersion: number;
};

export type DriverDeliveryExceptionResult = {
  assignmentEpoch: string;
  commandId: string;
  duplicate: boolean;
  exceptionId: string;
  executionContextId: string;
  notificationId: string;
  routeVersion: number;
};

export type DriverOperationalInboxItem = {
  ackedAt: string | null;
  businessStatus: 'CANCELLED' | 'EXPIRED' | 'OPEN' | 'RESOLVED';
  createdAt: string;
  expiresAt: string;
  id: string;
  kind: DriverOperationalNotificationKind;
  summary: { body: string; title: string };
};

export type DriverOperationalInboxPage = {
  items: DriverOperationalInboxItem[];
  nextCursor: string | null;
};

export type DriverNotificationResolution = {
  notificationId: string;
  destination:
    | { type: 'EXECUTION'; executionContextId: string; routePlanId: string; targetStopId?: string }
    | { type: 'ASSIGNMENT_RELEASED' };
};

export type DriverOperationalNotificationAck = { ackedAt: string; notificationId: string };
export type DriverOperationalCapabilityInput = {
  installationId: string;
  tokenId: string;
  schemaVersion: 1;
  kinds: readonly DriverOperationalNotificationKind[];
};
export type DriverOperationalCapability = {
  capabilityId: string;
  kinds: DriverOperationalNotificationKind[];
  schemaVersion: 1;
};

export class DriverOperationalApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'DriverOperationalApiError';
  }
}

const root = '/api/dsv/driver';
const notifications = `${root}/operational-notifications`;
const bigintPattern = /^[1-9]\d{0,18}$/u;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const commandKeys = [
  'assignmentEpoch', 'assignmentGeneration', 'commandId', 'expectedRouteVersionId', 'occurredAt', 'routeVersion',
] as const;
const notificationKinds: readonly DriverOperationalNotificationKind[] = ['N01', 'N02', 'N03', 'N04', 'N05', 'N06'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isPositiveBigint(value: unknown): value is string {
  return typeof value === 'string' && bigintPattern.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !instantPattern.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

function isServiceDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isNullableInstant(value: unknown): value is string | null {
  return value === null || isInstant(value);
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim().length <= max
    && ![...value].some((character) => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127;
    });
}

function isNotificationKind(value: unknown): value is DriverOperationalNotificationKind {
  return typeof value === 'string' && notificationKinds.some((kind) => kind === value);
}

function isKindList(value: unknown): value is DriverOperationalNotificationKind[] {
  return Array.isArray(value) && value.length > 0 && value.length <= notificationKinds.length
    && value.every(isNotificationKind) && new Set(value).size === value.length;
}

function isExecution(value: unknown): value is DriverExecutionContext {
  return hasOnlyKeys(value, [
    'executionContextId', 'routePlanId', 'routeVersion', 'assignmentEpoch', 'assignmentGeneration',
    'expectedRouteVersionId', 'serviceDate', 'status', 'startedAt',
  ]) && isUuid(value.executionContextId) && isUuid(value.routePlanId)
    && isPositiveInteger(value.routeVersion) && isPositiveBigint(value.assignmentEpoch)
    && isPositiveBigint(value.assignmentGeneration) && isUuid(value.expectedRouteVersionId)
    && isServiceDate(value.serviceDate) && typeof value.status === 'string'
    && ['ACTIVE', 'CANCELLED', 'COMPLETED'].includes(value.status)
    && isNullableInstant(value.startedAt);
}

function isCommand(value: unknown): value is DriverOperationalCommandInput {
  return isObject(value) && isUuid(value.commandId) && isInstant(value.occurredAt)
    && isPositiveInteger(value.routeVersion) && isPositiveBigint(value.assignmentEpoch)
    && isPositiveBigint(value.assignmentGeneration) && isUuid(value.expectedRouteVersionId);
}

function isCommandResult(value: unknown): value is Record<string, unknown> & {
  assignmentEpoch: string; commandId: string; duplicate: boolean; executionContextId: string; routeVersion: number;
} {
  return isObject(value) && isPositiveBigint(value.assignmentEpoch) && isUuid(value.commandId)
    && typeof value.duplicate === 'boolean' && isUuid(value.executionContextId) && isPositiveInteger(value.routeVersion);
}

function matchesCommand(
  value: { assignmentEpoch: string; commandId: string; executionContextId: string; routeVersion: number },
  executionContextId: string,
  input: DriverOperationalCommandInput,
): boolean {
  return value.assignmentEpoch === input.assignmentEpoch && value.commandId === input.commandId
    && value.executionContextId === executionContextId && value.routeVersion === input.routeVersion;
}

function isStartResult(value: unknown): value is DriverStartExecutionResult {
  return hasOnlyKeys(value, [
    'assignmentEpoch', 'commandId', 'duplicate', 'executionContextId',
    'pickupCompletedEventId', 'routeStartedEventId', 'routeVersion',
  ]) && isCommandResult(value) && isUuid(value.pickupCompletedEventId) && isUuid(value.routeStartedEventId);
}

function isExceptionResult(value: unknown): value is DriverDeliveryExceptionResult {
  return hasOnlyKeys(value, [
    'assignmentEpoch', 'commandId', 'duplicate', 'exceptionId', 'executionContextId', 'notificationId', 'routeVersion',
  ]) && isCommandResult(value) && isUuid(value.exceptionId) && isUuid(value.notificationId);
}

function isInboxItem(value: unknown): value is DriverOperationalInboxItem {
  return hasOnlyKeys(value, ['ackedAt', 'businessStatus', 'createdAt', 'expiresAt', 'id', 'kind', 'summary'])
    && isNullableInstant(value.ackedAt) && typeof value.businessStatus === 'string'
    && ['CANCELLED', 'EXPIRED', 'OPEN', 'RESOLVED'].includes(value.businessStatus)
    && isInstant(value.createdAt) && isInstant(value.expiresAt) && isUuid(value.id) && isNotificationKind(value.kind)
    && hasOnlyKeys(value.summary, ['body', 'title']) && typeof value.summary.body === 'string'
    && typeof value.summary.title === 'string';
}

function isResolution(value: unknown): value is DriverNotificationResolution {
  if (!hasOnlyKeys(value, ['destination', 'notificationId']) || !isUuid(value.notificationId)) return false;
  const destination = value.destination;
  if (!isObject(destination)) return false;
  if (destination.type === 'ASSIGNMENT_RELEASED') return hasOnlyKeys(destination, ['type']);
  return hasOnlyKeys(destination, ['type', 'executionContextId', 'routePlanId', 'targetStopId'])
    && destination.type === 'EXECUTION' && isUuid(destination.executionContextId) && isUuid(destination.routePlanId)
    && (!Object.hasOwn(destination, 'targetStopId') || isUuid(destination.targetStopId));
}

function badRequest(): never {
  throw new DriverOperationalApiError(400, 'BAD_REQUEST');
}

// A transport retry must reuse the original command and fences. This client never
// retries a business command or substitutes the legacy /driver/events endpoints.
async function request<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(resolveDsvApiUrl(path), { ...init, headers, signal: controller.signal });
    const envelope: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = isObject(envelope) && isObject(envelope.error) && typeof envelope.error.code === 'string'
        ? envelope.error.code : `HTTP_${response.status}`;
      throw new DriverOperationalApiError(response.status, code);
    }
    if (!hasOnlyKeys(envelope, ['data', 'error']) || envelope.error !== null || !validate(envelope.data)) {
      throw new DriverOperationalApiError(response.status, 'INVALID_RESPONSE');
    }
    return envelope.data;
  } catch (error) {
    if (timedOut) throw new DriverOperationalApiError(0, 'REQUEST_TIMEOUT');
    if (error instanceof DriverOperationalApiError) throw error;
    throw new DriverOperationalApiError(0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function loadDriverExecutionContexts(accessToken: string): Promise<DriverExecutionContext[]> {
  const data = await request(`${root}/executions`, accessToken, { method: 'GET' },
    (value): value is { items: DriverExecutionContext[]; limit: 100 } =>
      hasOnlyKeys(value, ['items', 'limit']) && value.limit === 100 && Array.isArray(value.items)
      && value.items.length <= 100 && value.items.every(isExecution));
  return data.items;
}

export async function startDriverExecution(
  accessToken: string,
  executionContextId: string,
  input: DriverOperationalCommandInput,
): Promise<DriverStartExecutionResult> {
  if (!isUuid(executionContextId) || !hasOnlyKeys(input, commandKeys) || !isCommand(input)) badRequest();
  return request(`${root}/executions/${executionContextId}/start`, accessToken, post(input),
    (value): value is DriverStartExecutionResult => isStartResult(value) && matchesCommand(value, executionContextId, input));
}

export async function reportDriverDeliveryException(
  accessToken: string,
  executionContextId: string,
  input: DriverDeliveryExceptionInput,
): Promise<DriverDeliveryExceptionResult> {
  if (!isUuid(executionContextId) || !hasOnlyKeys(input, [...commandKeys, 'targetStopId', 'reasonCode', 'explanation'])
    || !isCommand(input) || !isUuid(input.targetStopId) || !isBoundedText(input.reasonCode, 80)
    || (input.explanation !== undefined && input.explanation !== null && !isBoundedText(input.explanation, 1_000))) badRequest();
  // D05 defines no approved fleet catalog. Send the caller's injected reason.
  return request(`${root}/executions/${executionContextId}/delivery-exceptions`, accessToken, post(input),
    (value): value is DriverDeliveryExceptionResult => isExceptionResult(value) && matchesCommand(value, executionContextId, input));
}

export async function loadDriverOperationalInbox(accessToken: string, cursor?: string): Promise<DriverOperationalInboxPage> {
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor === '' || cursor.length > 300)) badRequest();
  const query = new URLSearchParams({ limit: '30' });
  if (cursor !== undefined) query.set('cursor', cursor);
  return request(`${notifications}?${query}`, accessToken, { method: 'GET' },
    (value): value is DriverOperationalInboxPage =>
      hasOnlyKeys(value, ['items', 'nextCursor']) && Array.isArray(value.items) && value.items.length <= 30
      && value.items.every(isInboxItem)
      && (value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor !== '' && value.nextCursor.length <= 300)));
}

export async function resolveDriverOperationalNotification(accessToken: string, id: string): Promise<DriverNotificationResolution> {
  if (!isUuid(id)) badRequest();
  return request(`${notifications}/${id}/resolve`, accessToken, { method: 'GET' },
    (value): value is DriverNotificationResolution => isResolution(value) && value.notificationId === id);
}

export async function acknowledgeDriverOperationalNotification(
  accessToken: string,
  id: string,
  ackKind: 'READ' | 'OPENED',
): Promise<DriverOperationalNotificationAck> {
  if (!isUuid(id) || !['READ', 'OPENED'].includes(ackKind)) badRequest();
  return request(`${notifications}/${id}/acks`, accessToken, post({ ackKind }),
    (value): value is DriverOperationalNotificationAck =>
      hasOnlyKeys(value, ['ackedAt', 'notificationId']) && isInstant(value.ackedAt) && value.notificationId === id);
}

export async function registerDriverOperationalCapability(
  accessToken: string,
  input: DriverOperationalCapabilityInput,
): Promise<DriverOperationalCapability> {
  if (!hasOnlyKeys(input, ['installationId', 'tokenId', 'schemaVersion', 'kinds'])
    || !isBoundedText(input.installationId, 160) || !isUuid(input.tokenId) || input.schemaVersion !== 1
    || !isKindList(input.kinds)) badRequest();
  return request(`${notifications}/capability`, accessToken, post(input),
    (value): value is DriverOperationalCapability =>
      hasOnlyKeys(value, ['capabilityId', 'kinds', 'schemaVersion']) && isUuid(value.capabilityId)
      && value.schemaVersion === 1 && isKindList(value.kinds)
      && value.kinds.length === input.kinds.length && value.kinds.every((kind) => input.kinds.includes(kind)));
}
