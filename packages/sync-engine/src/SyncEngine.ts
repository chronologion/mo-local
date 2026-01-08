import {
  SyncDirections,
  type SyncDirection,
  SyncErrorCodes,
  SyncPushConflictReasons,
  SyncStatusKinds,
  type SyncEngineOptions,
  type SyncError,
  type SyncStatus,
  type SyncPushConflictResponseV1,
  type SyncPushOkResponseV1,
  type SyncPullResponseV1,
  type PendingVersionRewriterPort,
} from './types';
import type { SqliteDbPort, SqliteStatement } from '@mo/eventstore-web';
import type { Unsubscribe } from '@mo/eventstore-core';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import { parseRecordJson, toRecordJson, toSyncRecord, type LocalEventRow } from './recordCodec';

type PendingEventRow = LocalEventRow & Readonly<{ commit_sequence: number }>;

const DEFAULT_PULL_LIMIT = 200;
const DEFAULT_PULL_WAIT_MS = 20_000;
const DEFAULT_PULL_INTERVAL_MS = 1_000;
const DEFAULT_PUSH_INTERVAL_MS = 2_000;
const DEFAULT_PUSH_FALLBACK_INTERVAL_MS = 60_000;
const DEFAULT_PUSH_BATCH_SIZE = 100;
const DEFAULT_MAX_PUSH_RETRIES = 2;
const MIN_PULL_BACKOFF_MS = 1_000;
const MAX_PULL_BACKOFF_MS = 20_000;
const MIN_PUSH_BACKOFF_MS = 1_000;
const MAX_PUSH_BACKOFF_MS = 20_000;
const DEFAULT_PUSH_DEBOUNCE_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const sleepWithCancel = (ms: number): Readonly<{ promise: Promise<void>; cancel: () => void }> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return { promise, cancel };
};

const nowMs = (): number => Date.now();

type DeferredSignal = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

const createDeferredSignal = (): DeferredSignal => {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  if (!resolve) {
    throw new Error('Failed to create deferred signal');
  }
  return { promise, resolve };
};

const applyJitter = (value: number): number => {
  const jitterRatio = 0.5 + Math.random();
  return Math.round(value * jitterRatio);
};

const nextBackoffMs = (current: number, min: number, max: number): number => {
  const base = current === 0 ? min : Math.min(current * 2, max);
  const jittered = applyJitter(base);
  return Math.min(Math.max(jittered, min), max);
};

const createSyncError = (
  code: SyncError['code'],
  message: string,
  context?: Readonly<Record<string, unknown>>
): SyncError => ({ code, message, context });

class SyncEngineError extends Error {
  readonly syncError: SyncError;
  readonly retryable: boolean;

  constructor(syncError: SyncError, options?: Readonly<{ retryable?: boolean }>) {
    super(syncError.message);
    this.name = 'SyncEngineError';
    this.syncError = syncError;
    this.retryable = options?.retryable ?? false;
  }
}

const isSyncEngineError = (error: unknown): error is SyncEngineError => error instanceof SyncEngineError;

const isAuthTransportError = (error: unknown): boolean => error instanceof Error && /unauthorized/i.test(error.message);

const toSyncEngineError = (
  error: unknown,
  fallback: Readonly<{ code: SyncError['code']; message: string }>
): SyncEngineError => {
  if (isSyncEngineError(error)) return error;
  if (isAuthTransportError(error)) {
    return new SyncEngineError(
      createSyncError(SyncErrorCodes.auth, 'Sync unauthorized', {
        message: error instanceof Error ? error.message : undefined,
      }),
      { retryable: false }
    );
  }
  return new SyncEngineError(
    createSyncError(fallback.code, fallback.message, error instanceof Error ? { message: error.message } : undefined),
    { retryable: true }
  );
};

const getLastError = (status: SyncStatus): SyncError | null => {
  if (status.kind === SyncStatusKinds.error) return status.error;
  if ('lastError' in status) return status.lastError;
  return null;
};

type PullState = {
  inFlight: boolean;
  inFlightPromise: Promise<void> | null;
  requested: boolean;
  backoffMs: number;
  notBeforeMs: number | null;
  signal: DeferredSignal | null;
  waiters: Array<() => void>;
};

type PushState = {
  inFlight: boolean;
  requested: boolean;
  queued: boolean;
  signalsSeen: boolean;
  backoffMs: number;
  notBeforeMs: number | null;
  signal: DeferredSignal | null;
};

const createPullState = (): PullState => ({
  inFlight: false,
  inFlightPromise: null,
  requested: false,
  backoffMs: 0,
  notBeforeMs: null,
  signal: null,
  waiters: [],
});

const createPushState = (): PushState => ({
  inFlight: false,
  requested: false,
  queued: false,
  signalsSeen: false,
  backoffMs: 0,
  notBeforeMs: null,
  signal: null,
});

export class SyncEngine {
  private readonly db: SqliteDbPort;
  private readonly transport: SyncEngineOptions['transport'];
  private readonly storeId: string;
  private readonly onRebaseRequired: () => Promise<void>;
  private readonly pullLimit: number;
  private readonly pullWaitMs: number;
  private readonly pullIntervalMs: number;
  private readonly pushIntervalMs: number;
  private readonly pushFallbackIntervalMs: number;
  private readonly pushBatchSize: number;
  private readonly maxPushRetries: number;
  private readonly onStatusChange?: (status: SyncStatus) => void;
  private readonly pendingVersionRewriter: PendingVersionRewriterPort | null;
  private readonly materializer: import('./types').SyncRecordMaterializerPort;
  private running = false;
  private pushUnsubscribe: Unsubscribe | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullState: PullState = createPullState();
  private pushState: PushState = createPushState();
  private pullAbortController: AbortController | null = null;
  private pushAbortController: AbortController | null = null;
  private status: SyncStatus = {
    kind: SyncStatusKinds.idle,
    lastSuccessAt: null,
    lastError: null,
  };
  private lastKnownHead: number | null = null;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.transport = options.transport;
    this.storeId = options.storeId;
    this.onRebaseRequired = options.onRebaseRequired;
    this.pendingVersionRewriter = options.pendingVersionRewriter ?? null;
    this.materializer = options.materializer;
    this.pullLimit = options.pullLimit ?? DEFAULT_PULL_LIMIT;
    this.pullWaitMs = options.pullWaitMs ?? DEFAULT_PULL_WAIT_MS;
    this.pullIntervalMs = options.pullIntervalMs ?? DEFAULT_PULL_INTERVAL_MS;
    this.pushIntervalMs = options.pushIntervalMs ?? DEFAULT_PUSH_INTERVAL_MS;
    this.pushFallbackIntervalMs = options.pushFallbackIntervalMs ?? DEFAULT_PUSH_FALLBACK_INTERVAL_MS;
    this.pushBatchSize = options.pushBatchSize ?? DEFAULT_PUSH_BATCH_SIZE;
    this.maxPushRetries = options.maxPushRetries ?? DEFAULT_MAX_PUSH_RETRIES;
    this.onStatusChange = options.onStatusChange;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.ensureSyncMetaRow().then(() => {
      this.subscribeToPushSignals();
      this.requestInitialPush();
      void this.pullLoop();
      void this.pushLoop();
    });
  }

  stop(): void {
    this.running = false;
    this.pullAbortController?.abort();
    this.pullAbortController = null;
    this.pushAbortController?.abort();
    this.pushAbortController = null;
    this.transport.setAbortSignal(SyncDirections.pull, null);
    this.transport.setAbortSignal(SyncDirections.push, null);
    this.pushUnsubscribe?.();
    this.pushUnsubscribe = null;
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.signalPull();
    this.signalPush();
    this.resolvePullWaiters();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  async syncOnce(): Promise<void> {
    await this.ensureSyncMetaRow();
    await this.pullOnce({ waitMs: 0 });
    await this.pushOnce();
  }

  async debugPullOnce(options?: Readonly<{ waitMs?: number }>): Promise<void> {
    await this.ensureSyncMetaRow();
    await this.pullOnce({ waitMs: options?.waitMs ?? 0 });
  }

  async debugPushOnce(): Promise<void> {
    await this.ensureSyncMetaRow();
    await this.pushOnce();
  }

  async resetSyncState(): Promise<void> {
    if (this.running) {
      throw new Error('Cannot reset sync state while sync engine is running');
    }
    const now = nowMs();
    await this.db.batch([
      {
        kind: SqliteStatementKinds.execute,
        // sync_event_map is global per local store; no per-store scoping exists today.
        sql: 'DELETE FROM sync_event_map',
      },
      {
        kind: SqliteStatementKinds.execute,
        sql: 'DELETE FROM sync_meta WHERE store_id = ?',
        params: [this.storeId],
      },
      {
        kind: SqliteStatementKinds.execute,
        sql: 'INSERT INTO sync_meta (store_id, last_pulled_global_seq, updated_at) VALUES (?, ?, ?)',
        params: [this.storeId, 0, now],
      },
    ]);
    this.lastKnownHead = null;
    this.pullState.backoffMs = 0;
    this.pullState.notBeforeMs = null;
    this.pushState.backoffMs = 0;
    this.pushState.notBeforeMs = null;
    this.setStatus({
      kind: SyncStatusKinds.idle,
      lastSuccessAt: this.status.lastSuccessAt ?? null,
      lastError: null,
    });
  }

  private async pullLoop(): Promise<void> {
    while (this.running) {
      const waitMs = this.consumePullRequest() ? 0 : this.pullWaitMs > 0 ? this.pullWaitMs : 0;
      await this.pullOnce({ waitMs });
      if (!this.running) return;
      await this.waitForNextPull();
    }
  }

  private async pushLoop(): Promise<void> {
    while (this.running) {
      await this.waitForNextPush();
      if (!this.running) return;
      this.pushState.requested = false;
      await this.pushOnce();
    }
  }

  private setStatus(next: SyncStatus): void {
    this.status = next;
    this.onStatusChange?.(next);
  }

  private setErrorStatus(error: SyncError, retryAt: number | null): void {
    this.setStatus({
      kind: SyncStatusKinds.error,
      error,
      retryAt,
      lastSuccessAt: this.status.lastSuccessAt ?? null,
    });
  }

  private setSyncing(direction: SyncDirection) {
    this.setStatus({
      kind: SyncStatusKinds.syncing,
      direction,
      lastSuccessAt: this.status.lastSuccessAt ?? null,
      lastError: getLastError(this.status),
    });
  }

  private setIdle(): void {
    this.setStatus({
      kind: SyncStatusKinds.idle,
      lastSuccessAt: this.status.lastSuccessAt ?? null,
      lastError: getLastError(this.status),
    });
  }

  private async pullOnce(options: { waitMs: number }): Promise<void> {
    if (this.pullState.inFlight) return;
    this.pullState.inFlight = true;
    this.pullState.inFlightPromise = this.pullOnceInternal(options);
    try {
      await this.pullState.inFlightPromise;
    } finally {
      this.pullState.inFlightPromise = null;
    }
  }

  private async pullOnceInternal(options: { waitMs: number }): Promise<void> {
    this.setSyncing(SyncDirections.pull);
    try {
      const hadPending = await this.hasPendingEvents();
      let since = await this.readLastPulledGlobalSeq();
      let pulledAny = false;
      let head = this.lastKnownHead ?? since;
      let keepPulling = true;

      while (keepPulling) {
        this.pullAbortController?.abort();
        this.pullAbortController = new AbortController();
        this.transport.setAbortSignal(SyncDirections.pull, this.pullAbortController.signal);
        const response = await this.transport.pull({
          storeId: this.storeId,
          since,
          limit: this.pullLimit,
          waitMs: options.waitMs,
        });
        head = response.head;
        this.lastKnownHead = head;

        if (response.events.length === 0) {
          keepPulling = false;
          break;
        }

        const applied = await this.applyRemoteEvents(response.events);
        pulledAny = pulledAny || applied;

        const nextSince = response.nextSince;
        if (nextSince !== null) {
          since = nextSince;
          await this.writeLastPulledGlobalSeq(since);
        }

        if (response.hasMore && nextSince === null) {
          throw new Error('Sync pull response missing nextSince');
        }
        keepPulling = response.hasMore;
      }

      if (pulledAny && hadPending) {
        const stillPending = await this.hasPendingEvents();
        if (stillPending) {
          await this.onRebaseRequired();
        }
      }

      this.pullState.backoffMs = 0;
      this.pullState.notBeforeMs = null;
      this.setStatus({
        kind: SyncStatusKinds.idle,
        lastSuccessAt: nowMs(),
        lastError: null,
      });
    } catch (error) {
      const syncError = toSyncEngineError(error, {
        code: SyncErrorCodes.server,
        message: 'Sync pull failed',
      });
      if (!syncError.retryable) {
        this.pullState.backoffMs = 0;
        this.pullState.notBeforeMs = null;
        this.pullState.requested = false;
        this.setErrorStatus(syncError.syncError, null);
        return;
      }
      this.pullState.backoffMs = nextBackoffMs(this.pullState.backoffMs, MIN_PULL_BACKOFF_MS, MAX_PULL_BACKOFF_MS);
      const retryAt = nowMs() + this.pullState.backoffMs;
      this.pullState.notBeforeMs = retryAt;
      this.pullState.requested = true;
      this.setErrorStatus(syncError.syncError, retryAt);
    } finally {
      this.pullState.inFlight = false;
      this.resolvePullWaiters();
      this.pullAbortController = null;
      this.transport.setAbortSignal(SyncDirections.pull, null);
    }
  }

  private async pushOnce(): Promise<void> {
    if (this.pushState.inFlight) return;
    this.pushState.inFlight = true;
    this.setSyncing(SyncDirections.push);
    try {
      let attempt = 0;
      while (attempt < this.maxPushRetries) {
        attempt += 1;
        const pending = await this.loadPendingEvents(this.pushBatchSize);
        if (pending.length === 0) {
          this.setIdle();
          this.pushState.backoffMs = 0;
          this.pushState.notBeforeMs = null;
          this.pushState.requested = false;
          return;
        }
        const expectedHead = await this.getExpectedHead();
        const events = pending.map((row) => ({
          eventId: row.id,
          recordJson: toRecordJson(toSyncRecord(row)),
        }));
        this.pushAbortController?.abort();
        this.pushAbortController = new AbortController();
        this.transport.setAbortSignal(SyncDirections.push, this.pushAbortController.signal);
        const response = await this.transport.push({
          storeId: this.storeId,
          expectedHead,
          events,
        });

        if (response.ok) {
          await this.applyAssignments(response);
          await this.writeLastPulledGlobalSeq(Math.max(await this.readLastPulledGlobalSeq(), response.head));
          this.lastKnownHead = response.head;
          this.setStatus({
            kind: SyncStatusKinds.idle,
            lastSuccessAt: nowMs(),
            lastError: null,
          });
          this.pushState.backoffMs = 0;
          this.pushState.notBeforeMs = null;
          const stillPending = await this.hasPendingEvents();
          if (stillPending && response.assigned.length > 0) {
            this.requestPush();
          }
          return;
        }

        await this.handleConflict(response, expectedHead);
      }
    } catch (error) {
      const syncError = toSyncEngineError(error, {
        code: SyncErrorCodes.network,
        message: 'Sync push failed',
      });
      if (!syncError.retryable) {
        this.pushState.backoffMs = 0;
        this.pushState.notBeforeMs = null;
        this.pushState.requested = false;
        this.setErrorStatus(syncError.syncError, null);
        return;
      }
      this.pushState.backoffMs = nextBackoffMs(this.pushState.backoffMs, MIN_PUSH_BACKOFF_MS, MAX_PUSH_BACKOFF_MS);
      const retryAt = nowMs() + this.pushState.backoffMs;
      this.pushState.notBeforeMs = retryAt;
      this.setErrorStatus(syncError.syncError, retryAt);
      this.requestPush();
    } finally {
      this.pushState.inFlight = false;
      this.pushAbortController = null;
      this.transport.setAbortSignal(SyncDirections.push, null);
    }
  }

  private async handleConflict(response: SyncPushConflictResponseV1, expectedHead: number): Promise<void> {
    const missing = response.missing ?? [];
    const missingCount = response.reason === SyncPushConflictReasons.serverAhead ? missing.length : undefined;
    console.info('[SyncEngine] push conflict', {
      expectedHead,
      serverHead: response.head,
      ...(missingCount === undefined ? {} : { missingCount }),
      reason: response.reason,
    });
    if (response.reason === SyncPushConflictReasons.serverBehind) {
      throw new SyncEngineError(
        createSyncError(SyncErrorCodes.conflict, 'Sync server head behind expected; reset sync state to re-push', {
          expectedHead,
          serverHead: response.head,
          reason: response.reason,
        }),
        { retryable: false }
      );
    }
    if (missing.length > 0) {
      const hadPending = await this.hasPendingEvents();
      const cursorBefore = await this.readLastPulledGlobalSeq();
      const applied = await this.applyRemoteEvents(missing);
      await this.writeLastPulledGlobalSeq(Math.max(await this.readLastPulledGlobalSeq(), response.head));
      this.lastKnownHead = response.head;
      if (applied && hadPending) {
        const stillPending = await this.hasPendingEvents();
        if (stillPending) {
          console.info('[SyncEngine] rebase required after pull', {
            cursorBefore,
            cursorAfter: Math.max(cursorBefore, response.head),
            hadPending,
            stillPending,
          });
          await this.onRebaseRequired();
        }
      }
      return;
    }

    await this.awaitPullIfInFlight();
    let current = await this.readLastPulledGlobalSeq();
    if (current <= expectedHead) {
      console.info('[SyncEngine] conflict without missing; requesting pull', {
        expectedHead,
        cursorBefore: current,
      });
      await this.requestImmediatePull();
      current = await this.readLastPulledGlobalSeq();
    }
    console.info('[SyncEngine] conflict pull result', {
      expectedHead,
      cursorAfter: current,
    });
    if (current <= expectedHead) {
      throw new SyncEngineError(
        createSyncError(SyncErrorCodes.conflict, 'Sync conflict did not advance cursor', {
          expectedHead,
          cursorAfter: current,
        }),
        { retryable: true }
      );
    }
  }

  private async getExpectedHead(): Promise<number> {
    if (this.lastKnownHead !== null) {
      return this.lastKnownHead;
    }
    return this.lastKnownHead ?? (await this.readLastPulledGlobalSeq());
  }

  private subscribeToPushSignals(): void {
    if (this.pushUnsubscribe) return;
    this.pushUnsubscribe = this.db.subscribeToTables(['events'], () => {
      if (!this.running) return;
      this.schedulePush();
    });
  }

  private schedulePush(): void {
    this.pushState.signalsSeen = true;
    this.pushState.queued = true;
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      if (!this.running) return;
      if (!this.pushState.queued) return;
      this.pushState.queued = false;
      this.requestPush();
    }, DEFAULT_PUSH_DEBOUNCE_MS);
  }

  private requestInitialPush(): void {
    if (!this.running) return;
    this.requestPush();
  }

  private requestPush(): void {
    this.pushState.requested = true;
    this.signalPush();
  }

  private consumePullRequest(): boolean {
    if (!this.pullState.requested) return false;
    this.pullState.requested = false;
    return true;
  }

  private async requestImmediatePull(): Promise<void> {
    if (!this.running) {
      await this.pullOnce({ waitMs: 0 });
      return;
    }
    if (this.pullState.inFlightPromise) {
      await this.pullState.inFlightPromise;
      return;
    }
    this.pullState.requested = true;
    this.signalPull();
    await new Promise<void>((resolve) => {
      this.pullState.waiters.push(resolve);
    });
  }

  private async awaitPullIfInFlight(): Promise<void> {
    if (this.pullState.inFlightPromise) {
      await this.pullState.inFlightPromise;
    }
  }

  private resolvePullWaiters(): void {
    if (this.pullState.waiters.length === 0) return;
    const waiters = this.pullState.waiters;
    this.pullState.waiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  private signalPull(): void {
    if (!this.pullState.signal) return;
    this.pullState.signal.resolve();
    this.pullState.signal = null;
  }

  private signalPush(): void {
    if (!this.pushState.signal) return;
    this.pushState.signal.resolve();
    this.pushState.signal = null;
  }

  private async waitForPushSignal(): Promise<void> {
    if (!this.pushState.signal) {
      this.pushState.signal = createDeferredSignal();
    }
    await this.pushState.signal.promise;
  }

  private async waitForPullSignal(): Promise<void> {
    if (!this.pullState.signal) {
      this.pullState.signal = createDeferredSignal();
    }
    await this.pullState.signal.promise;
  }

  private async waitForNextPull(): Promise<void> {
    if (this.status.kind === SyncStatusKinds.error && this.status.retryAt === null) {
      await this.waitForPullSignal();
      return;
    }
    const delay = this.getPullDelayMs();
    if (delay <= 0) {
      if (this.pullWaitMs === 0 && this.pullIntervalMs === 0) {
        await this.waitForPullSignal();
      }
      return;
    }
    const now = nowMs();
    const backoffActive = this.pullState.notBeforeMs !== null && this.pullState.notBeforeMs > now;
    if (backoffActive) {
      await sleep(delay);
      return;
    }
    await this.waitForPullSignalOrDelay(delay);
  }

  private async waitForNextPush(): Promise<void> {
    if (this.status.kind === SyncStatusKinds.error && this.status.retryAt === null) {
      await this.waitForPushSignal();
      return;
    }
    const delay = this.getPushDelayMs();
    if (this.pushState.requested) {
      if (delay > 0) {
        await sleep(delay);
      }
      return;
    }
    if (delay <= 0) {
      await this.waitForPushSignal();
      return;
    }
    const now = nowMs();
    const backoffActive = this.pushState.notBeforeMs !== null && this.pushState.notBeforeMs > now;
    if (backoffActive) {
      await sleep(delay);
      return;
    }
    await this.waitForPushSignalOrDelay(delay);
  }

  private async waitForPullSignalOrDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    if (!this.pullState.signal) {
      this.pullState.signal = createDeferredSignal();
    }
    const currentSignal = this.pullState.signal;
    const sleeper = sleepWithCancel(delayMs);
    const winner = await Promise.race([
      currentSignal.promise.then(() => 'signal' as const),
      sleeper.promise.then(() => 'sleep' as const),
    ]);
    if (winner === 'signal') {
      sleeper.cancel();
    }
    if (this.pullState.signal === currentSignal) {
      this.pullState.signal = null;
    }
  }

  private async waitForPushSignalOrDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    if (!this.pushState.signal) {
      this.pushState.signal = createDeferredSignal();
    }
    const currentSignal = this.pushState.signal;
    const sleeper = sleepWithCancel(delayMs);
    const winner = await Promise.race([
      currentSignal.promise.then(() => 'signal' as const),
      sleeper.promise.then(() => 'sleep' as const),
    ]);
    if (winner === 'signal') {
      sleeper.cancel();
    }
    if (this.pushState.signal === currentSignal) {
      this.pushState.signal = null;
    }
  }

  private getPullDelayMs(): number {
    const now = nowMs();
    if (this.pullState.notBeforeMs !== null && this.pullState.notBeforeMs > now) {
      return this.pullState.notBeforeMs - now;
    }
    if (this.pullState.requested) {
      return 0;
    }
    if (this.pullWaitMs > 0) {
      return 0;
    }
    return this.pullIntervalMs;
  }

  private getPushDelayMs(): number {
    const now = nowMs();
    if (this.pushState.notBeforeMs !== null && this.pushState.notBeforeMs > now) {
      return this.pushState.notBeforeMs - now;
    }
    if (this.pushState.requested) {
      return 0;
    }
    if (this.pushState.signalsSeen) {
      return this.pushFallbackIntervalMs;
    }
    return this.pushIntervalMs;
  }

  private async ensureSyncMetaRow(): Promise<void> {
    const now = nowMs();
    await this.db.execute(
      'INSERT OR IGNORE INTO sync_meta (store_id, last_pulled_global_seq, updated_at) VALUES (?, ?, ?)',
      [this.storeId, 0, now]
    );
  }

  private async readLastPulledGlobalSeq(): Promise<number> {
    const rows = await this.db.query<{ last_pulled_global_seq: number }>(
      'SELECT last_pulled_global_seq FROM sync_meta WHERE store_id = ?',
      [this.storeId]
    );
    const value = rows[0]?.last_pulled_global_seq ?? 0;
    return Number(value) || 0;
  }

  private async writeLastPulledGlobalSeq(value: number): Promise<void> {
    const now = nowMs();
    await this.db.execute(
      'INSERT INTO sync_meta (store_id, last_pulled_global_seq, updated_at) VALUES (?, ?, ?) ON CONFLICT(store_id) DO UPDATE SET last_pulled_global_seq = excluded.last_pulled_global_seq, updated_at = excluded.updated_at',
      [this.storeId, value, now]
    );
  }

  private async hasPendingEvents(): Promise<boolean> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM events e LEFT JOIN sync_event_map m ON m.event_id = e.id WHERE m.event_id IS NULL'
    );
    const count = Number(rows[0]?.count ?? 0);
    return count > 0;
  }

  private async loadPendingEvents(limit: number): Promise<ReadonlyArray<PendingEventRow>> {
    const rows = await this.db.query<PendingEventRow>(
      `SELECT
        e.id,
        e.aggregate_type,
        e.aggregate_id,
        e.event_type,
        e.payload_encrypted,
        e.keyring_update,
        e.version,
        e.occurred_at,
        e.actor_id,
        e.causation_id,
        e.correlation_id,
        e.epoch,
        e.commit_sequence
      FROM events e
      LEFT JOIN sync_event_map m ON m.event_id = e.id
      WHERE m.event_id IS NULL
      ORDER BY e.commit_sequence ASC
      LIMIT ?`,
      [limit]
    );
    return rows;
  }

  private async applyRemoteEvents(events: ReadonlyArray<SyncPullResponseV1['events'][number]>): Promise<boolean> {
    if (events.length === 0) return false;
    const eventIds = events.map((event) => event.eventId);
    const existingMapRows = await this.db.query<{ event_id: string }>(
      `SELECT event_id FROM sync_event_map WHERE event_id IN (${eventIds.map(() => '?').join(',')})`,
      eventIds
    );
    const existingMap = new Set(existingMapRows.map((row) => row.event_id));
    const now = nowMs();

    const statements: SqliteStatement[] = [];
    const insertedEventIds: string[] = [];
    const insertedEventContextById = new Map<string, { aggregateType: string; aggregateId: string; version: number }>();
    for (const incoming of events) {
      const record = parseRecordJson(incoming.recordJson);
      const existingById = await this.db.query<{ id: string }>('SELECT id FROM events WHERE id = ? LIMIT 1', [
        incoming.eventId,
      ]);
      if (existingById.length === 0) {
        const maxRewriteAttempts = 128;
        let collisionResolved = false;
        for (let attempt = 0; attempt < maxRewriteAttempts; attempt += 1) {
          const occupying = await this.db.query<{ id: string }>(
            'SELECT id FROM events WHERE aggregate_type = ? AND aggregate_id = ? AND version = ? LIMIT 1',
            [record.aggregateType, record.aggregateId, record.version]
          );
          const occupyingId = occupying[0]?.id ?? null;
          if (!occupyingId) {
            collisionResolved = true;
            break;
          }

          const occupyingIsSynced = await this.db.query<{ event_id: string }>(
            'SELECT event_id FROM sync_event_map WHERE event_id = ? LIMIT 1',
            [occupyingId]
          );
          if (occupyingIsSynced.length > 0) {
            throw new SyncEngineError(
              createSyncError(SyncErrorCodes.conflict, 'Remote version collision with synced event', {
                aggregateType: record.aggregateType,
                aggregateId: record.aggregateId,
                version: record.version,
                existingEventId: occupyingId,
                incomingEventId: incoming.eventId,
              }),
              { retryable: false }
            );
          }

          if (!this.pendingVersionRewriter) {
            throw new SyncEngineError(
              createSyncError(SyncErrorCodes.conflict, 'Pending version rewrite required but no rewriter configured', {
                aggregateType: record.aggregateType,
                aggregateId: record.aggregateId,
                version: record.version,
              }),
              { retryable: false }
            );
          }

          const result = await this.pendingVersionRewriter.rewritePendingVersions({
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            fromVersionInclusive: record.version,
          });
          console.info('[SyncEngine] pending rewrite applied', {
            aggregateType: result.aggregateType,
            aggregateId: result.aggregateId,
            fromVersionInclusive: result.fromVersionInclusive,
            shiftedCount: result.shiftedCount,
            oldMaxVersion: result.oldMaxVersion,
            newMaxVersion: result.newMaxVersion,
          });
        }
        if (!collisionResolved) {
          throw new SyncEngineError(
            createSyncError(SyncErrorCodes.conflict, 'Pending version rewrite did not resolve version collision', {
              aggregateType: record.aggregateType,
              aggregateId: record.aggregateId,
              version: record.version,
              incomingEventId: incoming.eventId,
              maxRewriteAttempts,
            }),
            { retryable: false }
          );
        }

        const materialized = await this.materializer.materializeRemoteEvent({
          eventId: incoming.eventId,
          recordJson: incoming.recordJson,
          globalSequence: incoming.globalSequence,
        });
        const eventRow = materialized.eventRow;
        const payload = eventRow.payload_encrypted;
        const keyringUpdate = eventRow.keyring_update;
        statements.push({
          kind: SqliteStatementKinds.execute,
          sql: `INSERT OR IGNORE INTO events (
            id,
            aggregate_type,
            aggregate_id,
            event_type,
            payload_encrypted,
            keyring_update,
            version,
            occurred_at,
            actor_id,
            causation_id,
            correlation_id,
            epoch
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            eventRow.id,
            eventRow.aggregate_type,
            eventRow.aggregate_id,
            eventRow.event_type,
            payload,
            keyringUpdate,
            eventRow.version,
            eventRow.occurred_at,
            eventRow.actor_id,
            eventRow.causation_id,
            eventRow.correlation_id,
            eventRow.epoch,
          ],
        });
        insertedEventIds.push(eventRow.id);
        insertedEventContextById.set(eventRow.id, {
          aggregateType: record.aggregateType,
          aggregateId: record.aggregateId,
          version: record.version,
        });
      }

      statements.push({
        kind: SqliteStatementKinds.execute,
        sql: `INSERT OR IGNORE INTO sync_event_map (event_id, global_seq, inserted_at)
          SELECT ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM events WHERE id = ?)`,
        params: [incoming.eventId, incoming.globalSequence, now, incoming.eventId],
      });
    }
    await this.db.batch(statements);

    if (insertedEventIds.length > 0) {
      for (const eventId of insertedEventIds) {
        const inserted = await this.db.query<{ id: string }>('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
        if (inserted.length === 0) {
          const ctx = insertedEventContextById.get(eventId);
          throw new SyncEngineError(
            createSyncError(
              SyncErrorCodes.conflict,
              'Remote event insert did not persist (possible version collision)',
              { eventId, ...(ctx ?? {}) }
            ),
            { retryable: false }
          );
        }
      }
    }

    return events.some((event) => !existingMap.has(event.eventId));
  }

  private async applyAssignments(response: SyncPushOkResponseV1): Promise<void> {
    const now = nowMs();
    const statements: SqliteStatement[] = response.assigned.map((assignment) => ({
      kind: SqliteStatementKinds.execute,
      sql: `INSERT OR IGNORE INTO sync_event_map (event_id, global_seq, inserted_at) VALUES (?, ?, ?)`,
      params: [assignment.eventId, assignment.globalSequence, now],
    }));
    if (statements.length === 0) return;
    await this.db.batch(statements);
  }
}
