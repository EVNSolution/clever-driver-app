import {
  isDriverOperationalPushNotification,
  parseDriverPushNotification,
  type DriverNotificationClick,
} from './driverPushNotification';

export type DriverNotificationClickStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type DriverNotificationClickLease = {
  accountId: string;
  attemptId: number;
  generation: number;
  notification: DriverNotificationClick;
};
const STORAGE_KEY = 'driver.push.pending-clicks.v1';
const MAX_IDENTITIES = 32;
type StoredClicks = { accountId: string | null; accepted: string[]; pending: DriverNotificationClick[] };

/** Stores notification identities only. Destination details must come from the authenticated resolver. */
export function createDriverNotificationRecovery(
  storage: DriverNotificationClickStorage,
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let stored: StoredClicks = { accountId: null, accepted: [], pending: [] };
  let currentAccountId: string | null = null;
  let generation = 0;
  let identityRevision = 0;
  let resetIdentities = false;
  let attemptId = 0;
  let activeLease: DriverNotificationClickLease | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
  const empty = (): StoredClicks => ({ accountId: null, accepted: [], pending: [] });
  const snapshot = () => resetIdentities ? empty() : stored;
  const persist = (next: StoredClicks) => storage.setItem(STORAGE_KEY, JSON.stringify(next));
  const isCurrent = (lease: DriverNotificationClickLease) =>
    currentAccountId === lease.accountId && generation === lease.generation
    && activeLease?.attemptId === lease.attemptId;

  return {
    restore: () => serialize(async () => {
      const value = await storage.getItem(STORAGE_KEY);
      if (value === null) return;
      try {
        const parsed = JSON.parse(value) as unknown;
        if (!isRecord(parsed)
          || !(parsed.accountId === null || typeof parsed.accountId === 'string')
          || !Array.isArray(parsed.accepted) || parsed.accepted.length > MAX_IDENTITIES
          || !parsed.accepted.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 340)
          || !Array.isArray(parsed.pending) || parsed.pending.length > MAX_IDENTITIES) throw new Error('INVALID_CLICK_STORAGE');
        const pending = parsed.pending.map((identity) => parseStoredIdentity(identity, now()));
        if (pending.some((identity) => identity === null)) throw new Error('INVALID_CLICK_STORAGE');
        stored = { accountId: parsed.accountId, accepted: parsed.accepted, pending: pending as DriverNotificationClick[] };
      } catch {
        stored = { accountId: null, accepted: [], pending: [] };
        await storage.removeItem(STORAGE_KEY);
      }
    }),
    setAccount: (accountId: string | null) => {
      if (accountId !== null && ((currentAccountId !== null && currentAccountId !== accountId)
        || (!resetIdentities && stored.accountId !== null && stored.accountId !== accountId))) {
        identityRevision += 1;
      }
      if (currentAccountId !== accountId) {
        generation += 1;
        activeLease = null;
      }
      currentAccountId = accountId;
      const revision = identityRevision;
      return serialize(async () => {
        if (accountId === null || revision !== identityRevision) return;
        const previous = snapshot();
        const next: StoredClicks = previous.accountId !== null && previous.accountId !== accountId
          ? { accountId, accepted: [], pending: [] }
          : { ...previous, accountId };
        await persist(next);
        if (revision === identityRevision) { stored = next; resetIdentities = false; }
      });
    },
    receiveClick: (notification: DriverNotificationClick, options: { reopen?: boolean } = {}) => {
      const revision = identityRevision;
      return serialize(async () => {
        if (revision !== identityRevision) return false;
        const identity = parseStoredIdentity(notification, now());
        if (identity === null) throw new Error('INVALID_NOTIFICATION_IDENTITY');
        const key = identityKey(identity);
        const previous = snapshot();
        if (previous.pending.some((entry) => identityKey(entry) === key)) return false;
        if (previous.accepted.includes(key) && !options.reopen) return false;
        if (previous.pending.length >= MAX_IDENTITIES) throw new Error('NOTIFICATION_CLICK_QUEUE_FULL');
        const next: StoredClicks = { ...previous,
          accepted: previous.accepted.filter((entry) => entry !== key), pending: [...previous.pending, identity] };
        await persist(next);
        if (revision !== identityRevision) return false;
        stored = next;
        resetIdentities = false;
        return true;
      });
    },
    acquirePending: (): DriverNotificationClickLease | null => {
      if (resetIdentities || currentAccountId === null || stored.accountId !== currentAccountId
        || activeLease !== null || stored.pending.length === 0) return null;
      const notification = parseStoredIdentity(stored.pending[0], now())!;
      activeLease = { accountId: currentAccountId, attemptId: ++attemptId, generation, notification };
      return activeLease;
    },
    isCurrent,
    accept: (lease: DriverNotificationClickLease) => serialize(async () => {
      if (!isCurrent(lease)) return false;
      const key = identityKey(lease.notification);
      const next: StoredClicks = { ...stored,
        pending: stored.pending.filter((entry) => identityKey(entry) !== key),
        accepted: [...stored.accepted.filter((entry) => entry !== key), key].slice(-MAX_IDENTITIES) };
      await persist(next);
      if (!isCurrent(lease)) return false;
      stored = next;
      activeLease = null;
      return true;
    }),
    release: (lease: DriverNotificationClickLease) => {
      if (isCurrent(lease)) activeLease = null;
    },
    clearForLogout: () => {
      // Invalidate async resolver results before waiting for storage operations.
      generation += 1;
      identityRevision += 1;
      resetIdentities = true;
      const revision = identityRevision;
      currentAccountId = null;
      activeLease = null;
      return serialize(async () => {
        await storage.removeItem(STORAGE_KEY);
        if (revision === identityRevision) { stored = empty(); resetIdentities = false; }
      });
    },
  };
}

function identityKey(notification: DriverNotificationClick): string {
  return `${notification.kind}:${notification.notificationId}`;
}
function parseStoredIdentity(value: unknown, now: number): DriverNotificationClick | null {
  if (!isRecord(value) || typeof value.notificationId !== 'string' || value.notificationId.length === 0 || value.notificationId.length > 300) return null;
  if (value.kind === 'route_changed') return { kind: 'route_changed', notificationId: value.notificationId };
  if (value.kind === 'bundle_handoff') {
    return parseDriverPushNotification(value.notificationId, {
      type: 'driver_bundle_handoff', handoffRequestId: value.handoffRequestId, handoffEvent: value.event,
    }, now);
  }
  if (value.kind === 'unsupported') return { kind: 'unsupported', notificationId: value.notificationId, reason: 'UNSUPPORTED_PAYLOAD' };
  const parsed = parseDriverPushNotification(value.notificationId, {
    kind: value.kind, notificationId: value.notificationId, expiresAt: value.expiresAt, schemaVersion: value.schemaVersion,
  }, now);
  return parsed !== null && isDriverOperationalPushNotification(parsed) ? parsed : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
