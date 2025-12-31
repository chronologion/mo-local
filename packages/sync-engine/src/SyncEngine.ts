import {
  SyncDirections,
  type SyncDirection,
  SyncErrorCodes,
  SyncStatusKinds,
  type SyncEngineOptions,
  type SyncError,
  type SyncStatus,
  type SyncPushConflictResponseV1,
  type SyncPushOkResponseV1,
  type SyncPullResponseV1,
} from './types';
import type { SqliteDbPort, SqliteStatement } from '@mo/eventstore-web';
import type { Unsubscribe } from '@mo/eventstore-core';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import {
  parseRecordJson,
  decodeRecordKeyringUpdate,
  decodeRecordPayload,
  toRecordJson,
  toSyncRecord,
  type LocalEventRow,
} from './recordCodec';

type PendingEventRow = LocalEventRow & Readonly<{ commit_sequence: number }>;

const DEFAULT_PULL_LIMIT = 200;
const DEFAULT_PULL_WAIT_MS = 20_000;
const DEFAULT_PULL_INTERVAL_MS = 1_000;
const DEFAULT_PUSH_INTERVAL_MS = 2_000;
const DEFAULT_PUSH_BATCH_SIZE = 100;
const DEFAULT_MAX_PUSH_RETRIES = 2;
const MIN_PULL_BACKOFF_MS = 1_000;
const MAX_PULL_BACKOFF_MS = 20_000;
const MIN_PUSH_BACKOFF_MS = 1_000;
const MAX_PUSH_BACKOFF_MS = 20_000;
const DEFAULT_PUSH_DEBOUNCE_MS = 100;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const sleepWithCancel = (
  ms: number
): Readonly<{ promise: Promise<void>; cancel: () => void }> => {
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

const getLastError = (status: SyncStatus): SyncError | null => {
  if (status.kind === SyncStatusKinds.error) return status.error;
  if ('lastError' in status) return status.lastError;
  return null;
};

export class SyncEngine {
  private readonly db: SqliteDbPort;
  private readonly transport: SyncEngineOptions['transport'];
  private readonly storeId: string;
  private readonly onRebaseRequired: () => Promise<void>;
  private readonly pullLimit: number;
  private readonly pullWaitMs: number;
  private readonly pullIntervalMs: number;
  private readonly pushIntervalMs: number;
  private readonly pushBatchSize: number;
  private readonly maxPushRetries: number;
  private readonly onStatusChange?: (status: SyncStatus) => void;
  private running = false;
  private pullInFlight = false;
  private pushInFlight = false;
  private pushUnsubscribe: Unsubscribe | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushRequested = false;
  private pushQueued = false;
  private pullRequested = false;
  private pushSignalsSeen = false;
  private pushBackoffMs = 0;
  private pullSignal: DeferredSignal | null = null;
  private pushSignal: DeferredSignal | null = null;
  private pullInFlightPromise: Promise<void> | null = null;
  private pullWaiters: Array<() => void> = [];
  private status: SyncStatus = {
    kind: SyncStatusKinds.idle,
    lastSuccessAt: null,
    lastError: null,
  };
  private lastKnownHead: number | null = null;
  private pullBackoffMs = 0;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.transport = options.transport;
    this.storeId = options.storeId;
    this.onRebaseRequired = options.onRebaseRequired;
    this.pullLimit = options.pullLimit ?? DEFAULT_PULL_LIMIT;
    this.pullWaitMs = options.pullWaitMs ?? DEFAULT_PULL_WAIT_MS;
    this.pullIntervalMs = options.pullIntervalMs ?? DEFAULT_PULL_INTERVAL_MS;
    this.pushIntervalMs = options.pushIntervalMs ?? DEFAULT_PUSH_INTERVAL_MS;
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

  private async pullLoop(): Promise<void> {
    while (this.running) {
      const waitMs = this.consumePullRequest()
        ? 0
        : this.pullWaitMs > 0
          ? this.pullWaitMs
          : 0;
      await this.pullOnce({ waitMs });
      if (!this.running) return;
      const delay = this.getPullDelayMs();
      if (delay > 0) {
        if (this.pullBackoffMs > 0) {
          await sleep(delay);
        } else {
          await this.waitForPullSignalOrDelay(delay);
        }
      }
    }
  }

  private async pushLoop(): Promise<void> {
    while (this.running) {
      if (!this.pushRequested) {
        const delay = this.getPushDelayMs();
        if (delay > 0) {
          if (this.pushBackoffMs > 0) {
            await sleep(delay);
          } else {
            await this.waitForPushSignalOrDelay(delay);
          }
        } else {
          await this.waitForPushSignal();
        }
      }
      if (!this.running) return;
      this.pushRequested = false;
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
    if (this.pullInFlight) return;
    this.pullInFlight = true;
    this.pullInFlightPromise = this.pullOnceInternal(options);
    try {
      await this.pullInFlightPromise;
    } finally {
      this.pullInFlightPromise = null;
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

      this.pullBackoffMs = 0;
      this.setStatus({
        kind: SyncStatusKinds.idle,
        lastSuccessAt: nowMs(),
        lastError: null,
      });
    } catch (error) {
      this.pullBackoffMs = nextBackoffMs(
        this.pullBackoffMs,
        MIN_PULL_BACKOFF_MS,
        MAX_PULL_BACKOFF_MS
      );
      const retryAt = nowMs() + this.pullBackoffMs;
      this.setErrorStatus(
        createSyncError(
          SyncErrorCodes.server,
          'Sync pull failed',
          error instanceof Error ? { message: error.message } : undefined
        ),
        retryAt
      );
    } finally {
      this.pullInFlight = false;
      this.resolvePullWaiters();
    }
  }

  private async pushOnce(): Promise<void> {
    if (this.pushInFlight) return;
    this.pushInFlight = true;
    this.setSyncing(SyncDirections.push);
    try {
      const pending = await this.loadPendingEvents(this.pushBatchSize);
      if (pending.length === 0) {
        this.setIdle();
        this.pushBackoffMs = 0;
        this.pushRequested = false;
        return;
      }

      let attempt = 0;
      while (attempt < this.maxPushRetries) {
        attempt += 1;
        const expectedHead = await this.getExpectedHead();
        const events = pending.map((row) => ({
          eventId: row.id,
          recordJson: toRecordJson(toSyncRecord(row)),
        }));
        const response = await this.transport.push({
          storeId: this.storeId,
          expectedHead,
          events,
        });

        if (response.ok) {
          await this.applyAssignments(response);
          await this.writeLastPulledGlobalSeq(
            Math.max(await this.readLastPulledGlobalSeq(), response.head)
          );
          this.lastKnownHead = response.head;
          this.setStatus({
            kind: SyncStatusKinds.idle,
            lastSuccessAt: nowMs(),
            lastError: null,
          });
          this.pushBackoffMs = 0;
          const stillPending = await this.hasPendingEvents();
          if (stillPending && response.assigned.length > 0) {
            this.requestPush();
          }
          return;
        }

        await this.handleConflict(response, expectedHead);
      }
    } catch (error) {
      this.pushBackoffMs = nextBackoffMs(
        this.pushBackoffMs,
        MIN_PUSH_BACKOFF_MS,
        MAX_PUSH_BACKOFF_MS
      );
      const retryAt = nowMs() + this.pushBackoffMs;
      this.setErrorStatus(
        createSyncError(
          SyncErrorCodes.network,
          'Sync push failed',
          error instanceof Error ? { message: error.message } : undefined
        ),
        retryAt
      );
      this.requestPush();
    } finally {
      this.pushInFlight = false;
    }
  }

  private async handleConflict(
    response: SyncPushConflictResponseV1,
    expectedHead: number
  ): Promise<void> {
    const missing = response.missing ?? [];
    if (missing.length > 0) {
      const hadPending = await this.hasPendingEvents();
      const applied = await this.applyRemoteEvents(missing);
      await this.writeLastPulledGlobalSeq(
        Math.max(await this.readLastPulledGlobalSeq(), response.head)
      );
      this.lastKnownHead = response.head;
      if (applied && hadPending) {
        const stillPending = await this.hasPendingEvents();
        if (stillPending) {
          await this.onRebaseRequired();
        }
      }
      return;
    }

    await this.awaitPullIfInFlight();
    let current = await this.readLastPulledGlobalSeq();
    if (current <= expectedHead) {
      await this.requestImmediatePull();
      current = await this.readLastPulledGlobalSeq();
    }
    if (current <= expectedHead) {
      throw new Error('Sync conflict did not advance cursor');
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
    this.pushSignalsSeen = true;
    this.pushQueued = true;
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      if (!this.running) return;
      if (!this.pushQueued) return;
      this.pushQueued = false;
      this.requestPush();
    }, DEFAULT_PUSH_DEBOUNCE_MS);
  }

  private requestInitialPush(): void {
    if (!this.running) return;
    this.requestPush();
  }

  private requestPush(): void {
    this.pushRequested = true;
    this.signalPush();
  }

  private consumePullRequest(): boolean {
    if (!this.pullRequested) return false;
    this.pullRequested = false;
    return true;
  }

  private async requestImmediatePull(): Promise<void> {
    if (!this.running) {
      await this.pullOnce({ waitMs: 0 });
      return;
    }
    if (this.pullInFlightPromise) {
      await this.pullInFlightPromise;
      return;
    }
    this.pullRequested = true;
    this.signalPull();
    await new Promise<void>((resolve) => {
      this.pullWaiters.push(resolve);
    });
  }

  private async awaitPullIfInFlight(): Promise<void> {
    if (this.pullInFlightPromise) {
      await this.pullInFlightPromise;
    }
  }

  private resolvePullWaiters(): void {
    if (this.pullWaiters.length === 0) return;
    const waiters = this.pullWaiters;
    this.pullWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  private signalPull(): void {
    if (!this.pullSignal) return;
    this.pullSignal.resolve();
    this.pullSignal = null;
  }

  private signalPush(): void {
    if (!this.pushSignal) return;
    this.pushSignal.resolve();
    this.pushSignal = null;
  }

  private async waitForPushSignal(): Promise<void> {
    if (!this.pushSignal) {
      this.pushSignal = createDeferredSignal();
    }
    await this.pushSignal.promise;
  }

  private async waitForPullSignalOrDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    if (!this.pullSignal) {
      this.pullSignal = createDeferredSignal();
    }
    const currentSignal = this.pullSignal;
    const sleeper = sleepWithCancel(delayMs);
    const winner = await Promise.race([
      currentSignal.promise.then(() => 'signal' as const),
      sleeper.promise.then(() => 'sleep' as const),
    ]);
    if (winner === 'signal') {
      sleeper.cancel();
    }
    if (this.pullSignal === currentSignal) {
      this.pullSignal = null;
    }
  }

  private async waitForPushSignalOrDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    if (!this.pushSignal) {
      this.pushSignal = createDeferredSignal();
    }
    const currentSignal = this.pushSignal;
    const sleeper = sleepWithCancel(delayMs);
    const winner = await Promise.race([
      currentSignal.promise.then(() => 'signal' as const),
      sleeper.promise.then(() => 'sleep' as const),
    ]);
    if (winner === 'signal') {
      sleeper.cancel();
    }
    if (this.pushSignal === currentSignal) {
      this.pushSignal = null;
    }
  }

  private getPullDelayMs(): number {
    if (this.pullBackoffMs > 0) {
      return this.pullBackoffMs;
    }
    if (this.pullRequested) {
      return 0;
    }
    if (this.pullWaitMs > 0) {
      return 0;
    }
    return this.pullIntervalMs;
  }

  private getPushDelayMs(): number {
    if (this.pushBackoffMs > 0) {
      return this.pushBackoffMs;
    }
    if (this.pushSignalsSeen) {
      return 0;
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

  private async loadPendingEvents(
    limit: number
  ): Promise<ReadonlyArray<PendingEventRow>> {
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

  private async applyRemoteEvents(
    events: ReadonlyArray<SyncPullResponseV1['events'][number]>
  ): Promise<boolean> {
    if (events.length === 0) return false;
    const eventIds = events.map((event) => event.eventId);
    const existingMapRows = await this.db.query<{ event_id: string }>(
      `SELECT event_id FROM sync_event_map WHERE event_id IN (${eventIds
        .map(() => '?')
        .join(',')})`,
      eventIds
    );
    const existingMap = new Set(existingMapRows.map((row) => row.event_id));
    const now = nowMs();

    const statements: SqliteStatement[] = [];
    for (const incoming of events) {
      const record = parseRecordJson(incoming.recordJson);
      if (record.id !== incoming.eventId) {
        throw new Error(
          `Sync record id mismatch: ${record.id} !== ${incoming.eventId}`
        );
      }
      const payload = decodeRecordPayload(record);
      const keyringUpdate = decodeRecordKeyringUpdate(record);
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
          record.id,
          record.aggregateType,
          record.aggregateId,
          record.eventType,
          payload,
          keyringUpdate,
          record.version,
          record.occurredAt,
          record.actorId,
          record.causationId,
          record.correlationId,
          record.epoch,
        ],
      });
      statements.push({
        kind: SqliteStatementKinds.execute,
        sql: `INSERT OR IGNORE INTO sync_event_map (event_id, global_seq, inserted_at) VALUES (?, ?, ?)`,
        params: [incoming.eventId, incoming.globalSequence, now],
      });
    }
    await this.db.batch(statements);

    return events.some((event) => !existingMap.has(event.eventId));
  }

  private async applyAssignments(
    response: SyncPushOkResponseV1
  ): Promise<void> {
    const now = nowMs();
    const statements: SqliteStatement[] = response.assigned.map(
      (assignment) => ({
        kind: SqliteStatementKinds.execute,
        sql: `INSERT OR IGNORE INTO sync_event_map (event_id, global_seq, inserted_at) VALUES (?, ?, ?)`,
        params: [assignment.eventId, assignment.globalSequence, now],
      })
    );
    if (statements.length === 0) return;
    await this.db.batch(statements);
  }
}
