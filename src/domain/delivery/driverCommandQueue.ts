/** Small operational commands only. Tokens, photos, GPS, and local timers are excluded. */
export type DriverCommandSession = { accountId: string; generation: number | string };

export type DriverCommandContext = {
  assignmentEpoch: string;
  assignmentGeneration: string | null;
  executionContextId: string;
  expectedRouteVersionId: string | null;
  routeVersion: number;
  startedAt: string | null;
  status: string;
};

export type DriverCommandPayload = {
  assignmentEpoch: string;
  assignmentGeneration: string;
  commandId: string;
  expectedRouteVersionId: string;
  occurredAt: string;
  routeVersion: number;
};

export type DriverDeliveryExceptionDetails = {
  explanation?: string | null;
  reasonCode: string;
  targetStopId: string;
};

type StoredCommandState = {
  accountId: string;
  attempts: number;
  executionContextId: string;
  lastError: string | null;
  status: 'blocked' | 'confirmed' | 'pending';
};

export type DriverQueuedCommand = StoredCommandState & (
  | { payload: DriverCommandPayload; type: 'START_EXECUTION' }
  | { payload: DriverCommandPayload & DriverDeliveryExceptionDetails; type: 'REPORT_DELIVERY_EXCEPTION' }
);

export type DriverCommandAcknowledgement = {
  assignmentEpoch: string;
  commandId: string;
  executionContextId: string;
  routeVersion: number;
};

export type DriverCommandStore = {
  load(): Promise<readonly DriverQueuedCommand[]>;
  save(commands: readonly DriverQueuedCommand[]): Promise<void>;
};

type DriverCommandQueueOptions = {
  createCommandId(): string;
  getSession(): DriverCommandSession | null;
  loadContexts(session: DriverCommandSession): Promise<readonly DriverCommandContext[]>;
  now?: () => string;
  onAuthenticationRequired?: (session: DriverCommandSession) => void | Promise<void>;
  onChange?: (commands: DriverQueuedCommand[]) => void;
  send(command: DriverQueuedCommand, session: DriverCommandSession): Promise<DriverCommandAcknowledgement>;
  store: DriverCommandStore;
};

type SessionSnapshot = DriverCommandSession & { queueGeneration: number };

export class DriverCommandQueueError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DriverCommandQueueError';
  }
}

const MAX_COMMANDS = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POSITIVE_BIGINT = /^[1-9]\d{0,18}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,79}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

/** Serialized writes prevent concurrent taps and lifecycle retries from duplicating commands. */
export class DriverCommandQueue {
  private commands: DriverQueuedCommand[] = [];
  private initialized = false;
  private work: Promise<void> = Promise.resolve();
  private sessionGeneration = 0;
  private lastAccountId: string | null = null;
  private readonly interruptions = new Set<() => void>();
  private readonly suspendedGenerations = new Set<number>();
  private readonly enqueues = new Map<string, Promise<DriverQueuedCommand>>();

  constructor(private readonly options: DriverCommandQueueOptions) {}

  initialize(): Promise<void> {
    return this.serialize(() => this.load());
  }

  listForAccount(accountId: string): DriverQueuedCommand[] {
    if (this.options.getSession()?.accountId !== accountId) return [];
    return this.commands.filter((command) => command.accountId === accountId).map(cloneCommand);
  }

  async enqueueStart(context: DriverCommandContext): Promise<DriverQueuedCommand> {
    return this.enqueue({ ...context }, 'START_EXECUTION');
  }

  async enqueueDeliveryException(
    context: DriverCommandContext,
    details: DriverDeliveryExceptionDetails,
  ): Promise<DriverQueuedCommand> {
    return this.enqueue({ ...context }, 'REPORT_DELIVERY_EXCEPTION', { ...details });
  }

  async retryPending(): Promise<void> {
    const session = this.captureSession();
    await this.serialize(async () => {
      await this.load();
      this.assertSession(session);
      const pendingIds = this.commands
        .filter((command) => command.accountId === session.accountId && command.status === 'pending')
        .map((command) => command.payload.commandId);
      for (const commandId of pendingIds) {
        if (!this.isCurrentSession(session)) break;
        const command = this.commands.find((item) => item.payload.commandId === commandId);
        if (command?.status === 'pending') await this.attempt(command, session);
      }
    });
  }

  /** Call immediately on logout/account switch. It releases hung requests and durably blocks old work. */
  invalidateSession(): Promise<void> {
    const accountId = this.lastAccountId ?? this.options.getSession()?.accountId ?? null;
    this.suspendedGenerations.clear();
    this.sessionGeneration += 1;
    for (const interrupt of [...this.interruptions]) interrupt();
    this.publish();
    return this.serialize(async () => {
      await this.load();
      if (accountId === null) return;
      const next = this.commands.map((command): DriverQueuedCommand =>
        command.accountId === accountId && command.status === 'pending'
          ? { ...command, lastError: 'SESSION_CHANGED', status: 'blocked' }
          : command);
      await this.save(next);
    });
  }

  /** Detach/expired authentication stops local work, while a later same-account login can replay it. */
  suspendSession(): void {
    this.suspendedGenerations.add(this.sessionGeneration);
    this.sessionGeneration += 1;
    for (const interrupt of [...this.interruptions]) interrupt();
  }

  private async enqueue(
    context: DriverCommandContext,
    type: DriverQueuedCommand['type'],
    details?: DriverDeliveryExceptionDetails,
  ): Promise<DriverQueuedCommand> {
    const session = this.captureSession();
    const inputKey = JSON.stringify([
      session.accountId, session.generation, session.queueGeneration,
      context.executionContextId, context.routeVersion, context.assignmentEpoch,
      context.assignmentGeneration, context.expectedRouteVersionId, type,
      details?.targetStopId ?? null, details?.reasonCode ?? null, details?.explanation ?? null,
    ]);
    const concurrent = this.enqueues.get(inputKey);
    if (concurrent !== undefined) return concurrent;
    const result = this.serialize(async () => {
      await this.load();
      this.assertSession(session);
      if (context.assignmentGeneration === null || context.expectedRouteVersionId === null) {
        throw new DriverCommandQueueError('LEGACY_FENCE_REQUIRED');
      }
      const existing = this.commands.find((command) =>
        command.accountId === session.accountId && command.type === type
        && command.status !== 'blocked'
        && sameFences(command, context)
        && (type === 'START_EXECUTION' || command.status !== 'confirmed')
        && (type === 'START_EXECUTION' || (command.type === 'REPORT_DELIVERY_EXCEPTION'
          && command.payload.targetStopId === details?.targetStopId
          && command.payload.reasonCode === details?.reasonCode
          && (command.payload.explanation ?? null) === (details?.explanation ?? null))));
      if (existing !== undefined) {
        return existing.status === 'pending' ? this.attempt(existing, session) : cloneCommand(existing);
      }
      const payload: DriverCommandPayload = {
        assignmentEpoch: context.assignmentEpoch,
        assignmentGeneration: context.assignmentGeneration,
        commandId: this.options.createCommandId(),
        expectedRouteVersionId: context.expectedRouteVersionId,
        occurredAt: (this.options.now ?? (() => new Date().toISOString()))(),
        routeVersion: context.routeVersion,
      };
      const state: StoredCommandState = {
        accountId: session.accountId, attempts: 0,
        executionContextId: context.executionContextId,
        lastError: null, status: 'pending',
      };
      const command: DriverQueuedCommand = type === 'START_EXECUTION'
        ? { ...state, payload, type }
        : { ...state, payload: { ...payload, ...details! }, type };
      // Validate data even when an injected ID/reason source or persisted storage is malformed.
      parseStoredDriverCommands([command]);
      const retained = [...this.commands];
      if (retained.length >= MAX_COMMANDS) {
        const confirmedIndex = retained.findIndex((item) => item.status === 'confirmed');
        if (confirmedIndex < 0) throw new DriverCommandQueueError('QUEUE_FULL');
        retained.splice(confirmedIndex, 1);
      }
      await this.save([...retained, command]);
      return this.attempt(command, session);
    });
    this.enqueues.set(inputKey, result);
    try { return await result; } finally { this.enqueues.delete(inputKey); }
  }

  private async attempt(command: DriverQueuedCommand, session: SessionSnapshot): Promise<DriverQueuedCommand> {
    try {
      this.assertSession(session);
      const contexts = await this.withSession(() => this.options.loadContexts(session), session);
      const current = contexts.find((item) => item.executionContextId === command.executionContextId);
      if (current === undefined || current.status !== 'ACTIVE') {
        throw new DriverCommandQueueError('CONTEXT_NOT_AVAILABLE');
      }
      if (!sameFences(command, current)) throw new DriverCommandQueueError('FENCE_CHANGED');
      // startedAt is deliberately not treated as this command's receipt: replay requires a server ACK.
      command = { ...command, attempts: command.attempts + 1, lastError: null };
      await this.replace(command);
      this.assertSession(session);
      const result = await this.withSession(() => this.options.send(cloneCommand(command), session), session);
      if (result.commandId !== command.payload.commandId
        || result.executionContextId !== command.executionContextId
        || result.assignmentEpoch !== command.payload.assignmentEpoch
        || result.routeVersion !== command.payload.routeVersion) {
        throw new DriverCommandQueueError('INVALID_ACKNOWLEDGEMENT');
      }
      this.assertSession(session);
      const confirmed: DriverQueuedCommand = { ...command, lastError: null, status: 'confirmed' };
      await this.replace(confirmed);
      this.assertSession(session);
      return cloneCommand(confirmed);
    } catch (error) {
      if (this.suspendedGenerations.has(session.queueGeneration)) {
        // The pending body is already durable. A detached queue must not overwrite a new queue's writes.
        return cloneCommand({ ...command, lastError: 'SESSION_SUSPENDED', status: 'pending' });
      }
      const failure = this.isCurrentSession(session)
        ? classifyFailure(error)
        : { lastError: 'SESSION_CHANGED', status: 'blocked' as const };
      const failed: DriverQueuedCommand = { ...command, ...failure };
      await this.replace(failed);
      if (this.isCurrentSession(session) && error !== null && typeof error === 'object'
        && 'status' in error && error.status === 401) {
        this.requestAuthentication(session);
      }
      return cloneCommand(failed);
    } finally {
      this.suspendedGenerations.delete(session.queueGeneration);
    }
  }

  private async withSession<T>(operation: () => Promise<T>, session: SessionSnapshot): Promise<T> {
    this.assertSession(session);
    let interrupt!: () => void;
    const interrupted = new Promise<never>((_resolve, reject) => {
      interrupt = () => reject(new DriverCommandQueueError('SESSION_CHANGED'));
    });
    this.interruptions.add(interrupt);
    try {
      const result = await Promise.race([operation(), interrupted]);
      this.assertSession(session);
      return result;
    } finally {
      this.interruptions.delete(interrupt);
    }
  }

  private captureSession(): SessionSnapshot {
    const session = this.options.getSession();
    if (session === null) throw new DriverCommandQueueError('AUTHENTICATION_REQUIRED');
    this.lastAccountId = session.accountId;
    return { ...session, queueGeneration: this.sessionGeneration };
  }

  private requestAuthentication(session: DriverCommandSession): void {
    const recover = this.options.onAuthenticationRequired;
    if (recover === undefined) return;
    try {
      // Recovery can schedule a retry; awaiting it here would deadlock the serialized queue.
      void Promise.resolve(recover({ accountId: session.accountId, generation: session.generation }))
        .catch(() => undefined);
    } catch { /* A failed authentication recovery leaves the original command pending. */ }
  }

  private isCurrentSession(session: SessionSnapshot): boolean {
    const current = this.options.getSession();
    return current?.accountId === session.accountId && current.generation === session.generation
      && session.queueGeneration === this.sessionGeneration;
  }

  private assertSession(session: SessionSnapshot): void {
    if (!this.isCurrentSession(session)) throw new DriverCommandQueueError('SESSION_CHANGED');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.work.then(operation);
    this.work = result.then(() => undefined, () => undefined);
    return result;
  }

  private async load(): Promise<void> {
    if (this.initialized) return;
    this.commands = parseStoredDriverCommands(await this.options.store.load());
    this.initialized = true;
    this.lastAccountId = this.options.getSession()?.accountId ?? this.lastAccountId;
    this.publish();
  }

  private async replace(command: DriverQueuedCommand): Promise<void> {
    await this.save(this.commands.map((item) => item.payload.commandId === command.payload.commandId ? command : item));
  }

  private async save(commands: DriverQueuedCommand[]): Promise<void> {
    const validated = parseStoredDriverCommands(commands);
    await this.options.store.save(validated);
    this.commands = validated.map(cloneCommand);
    this.publish();
  }

  private publish(): void {
    const accountId = this.options.getSession()?.accountId;
    this.options.onChange?.(accountId === undefined ? [] : this.listForAccount(accountId));
  }
}

function sameFences(command: DriverQueuedCommand, context: DriverCommandContext): boolean {
  return command.executionContextId === context.executionContextId
    && command.payload.routeVersion === context.routeVersion
    && command.payload.assignmentEpoch === context.assignmentEpoch
    && command.payload.assignmentGeneration === context.assignmentGeneration
    && command.payload.expectedRouteVersionId === context.expectedRouteVersionId;
}

function cloneCommand(command: DriverQueuedCommand): DriverQueuedCommand {
  return { ...command, payload: { ...command.payload } } as DriverQueuedCommand;
}

function classifyFailure(error: unknown): { lastError: string; status: 'blocked' | 'pending' } {
  if (error instanceof DriverCommandQueueError) {
    return { lastError: error.code, status: error.code === 'INVALID_ACKNOWLEDGEMENT' ? 'pending' : 'blocked' };
  }
  const value = error !== null && typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {};
  const status = typeof value.status === 'number' ? value.status : 0;
  const lastError = typeof value.code === 'string' && ERROR_CODE.test(value.code) ? value.code : 'NETWORK_RETRY';
  // A successful HTTP status without a validated receipt leaves the server outcome unknown.
  const retryable = status === 0 || status === 401 || (status >= 200 && status < 300)
    || status >= 500 || status === 408 || status === 429;
  return { lastError, status: retryable ? 'pending' : 'blocked' };
}

/** Fail closed on corrupt/unexpected storage. Access tokens are never valid stored command fields. */
export function parseStoredDriverCommands(value: unknown): DriverQueuedCommand[] {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) throw new DriverCommandQueueError('STORAGE_INVALID');
  const ids = new Set<string>();
  const commands: DriverQueuedCommand[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ['accountId', 'attempts', 'executionContextId', 'lastError', 'payload', 'status', 'type'])
      || !isUuid(item.accountId) || !isUuid(item.executionContextId)
      || !Number.isSafeInteger(item.attempts) || Number(item.attempts) < 0
      || !['pending', 'blocked', 'confirmed'].includes(String(item.status))
      || (item.lastError !== null && (typeof item.lastError !== 'string' || !ERROR_CODE.test(item.lastError)))
      || !['START_EXECUTION', 'REPORT_DELIVERY_EXCEPTION'].includes(String(item.type))
      || !isRecord(item.payload)) throw new DriverCommandQueueError('STORAGE_INVALID');
    const payload = item.payload;
    const keys = ['assignmentEpoch', 'assignmentGeneration', 'commandId', 'expectedRouteVersionId', 'occurredAt', 'routeVersion'];
    if (item.type === 'REPORT_DELIVERY_EXCEPTION') keys.push('targetStopId', 'reasonCode', 'explanation');
    if (!exactKeys(payload, keys) || !isUuid(payload.commandId) || ids.has(payload.commandId)
      || !isUuid(payload.expectedRouteVersionId) || !isPositiveBigint(payload.assignmentEpoch)
      || !isPositiveBigint(payload.assignmentGeneration) || !Number.isSafeInteger(payload.routeVersion)
      || Number(payload.routeVersion) < 1 || typeof payload.occurredAt !== 'string'
      || !ISO_INSTANT.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt))) {
      throw new DriverCommandQueueError('STORAGE_INVALID');
    }
    if (item.type === 'REPORT_DELIVERY_EXCEPTION' && (!isUuid(payload.targetStopId)
      || typeof payload.reasonCode !== 'string' || payload.reasonCode.trim() !== payload.reasonCode
      || payload.reasonCode.length < 1 || payload.reasonCode.length > 80
      || (payload.explanation !== undefined && payload.explanation !== null
        && (typeof payload.explanation !== 'string' || payload.explanation.length > 1_000)))) {
      throw new DriverCommandQueueError('STORAGE_INVALID');
    }
    ids.add(payload.commandId);
    commands.push(cloneCommand(item as DriverQueuedCommand));
  }
  return commands;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isPositiveBigint(value: unknown): value is string {
  return typeof value === 'string' && POSITIVE_BIGINT.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n;
}
