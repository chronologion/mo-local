import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/SyncEngine';
import { encodeBase64Url } from '../src/base64url';
import type {
  SqliteBatchResult,
  SqliteDbPort,
  SqliteStatement,
  SqliteValue,
} from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import type {
  SyncStatus,
  SyncPullResponseV1,
  SyncPushConflictResponseV1,
  SyncPushOkResponseV1,
  SyncPushRequestV1,
  SyncTransportPort,
} from '../src/types';

type EventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  epoch: number | null;
  commit_sequence: number;
}>;

type SyncEventMapRow = Readonly<{
  event_id: string;
  global_seq: number;
  inserted_at: number;
}>;

type SyncMetaRow = Readonly<{
  store_id: string;
  last_pulled_global_seq: number;
  updated_at: number;
}>;

class MemoryDb implements SqliteDbPort {
  private events: EventRow[] = [];
  private syncEventMap: SyncEventMapRow[] = [];
  private syncMeta: SyncMetaRow[] = [];
  private commitSequence = 0;

  seedEvent(row: Omit<EventRow, 'commit_sequence'>): EventRow {
    this.commitSequence += 1;
    const inserted: EventRow = { ...row, commit_sequence: this.commitSequence };
    this.events.push(inserted);
    return inserted;
  }

  getSyncMeta(storeId: string): SyncMetaRow | undefined {
    return this.syncMeta.find((row) => row.store_id === storeId);
  }

  getEventMap(eventId: string): SyncEventMapRow | undefined {
    return this.syncEventMap.find((row) => row.event_id === eventId);
  }

  getEvent(eventId: string): EventRow | undefined {
    return this.events.find((row) => row.id === eventId);
  }

  shiftPendingVersions(params: {
    aggregateType: string;
    aggregateId: string;
    fromVersionInclusive: number;
  }): void {
    const pendingIds = new Set(
      this.events
        .filter(
          (row) =>
            row.aggregate_type === params.aggregateType &&
            row.aggregate_id === params.aggregateId &&
            row.version >= params.fromVersionInclusive &&
            !this.syncEventMap.some((map) => map.event_id === row.id)
        )
        .sort((a, b) => b.version - a.version)
        .map((row) => row.id)
    );

    this.events = this.events.map((row) => {
      if (!pendingIds.has(row.id)) return row;
      const nextVersion = row.version + 1;
      return {
        ...row,
        version: nextVersion,
        payload_encrypted: new Uint8Array([nextVersion]),
      };
    });
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('SELECT LAST_PULLED_GLOBAL_SEQ FROM SYNC_META')) {
      const storeId = String(params[0] ?? '');
      const row = this.getSyncMeta(storeId);
      return [
        { last_pulled_global_seq: row?.last_pulled_global_seq ?? 0 },
      ] as unknown as T[];
    }
    if (normalized.startsWith('SELECT COUNT(*) AS COUNT FROM EVENTS')) {
      const pending = this.pendingEvents();
      return [{ count: pending.length }] as unknown as T[];
    }
    if (normalized.startsWith('SELECT E.ID')) {
      const limit = Number(params[0] ?? 0);
      const pending = this.pendingEvents()
        .sort((a, b) => a.commit_sequence - b.commit_sequence)
        .slice(0, limit);
      return pending.map((row) => ({ ...row })) as unknown as T[];
    }
    if (normalized.startsWith('SELECT EVENT_ID FROM SYNC_EVENT_MAP')) {
      const ids = params.map((value) => String(value));
      const rows = this.syncEventMap
        .filter((row) => ids.includes(row.event_id))
        .map((row) => ({ event_id: row.event_id }));
      return rows as unknown as T[];
    }
    if (normalized.startsWith('SELECT ID FROM EVENTS WHERE ID = ?')) {
      const id = String(params[0] ?? '');
      const row = this.getEvent(id);
      return row ? ([{ id: row.id }] as unknown as T[]) : [];
    }
    if (
      normalized.startsWith(
        'SELECT ID FROM EVENTS WHERE AGGREGATE_TYPE = ? AND AGGREGATE_ID = ? AND VERSION = ?'
      )
    ) {
      const aggregateType = String(params[0] ?? '');
      const aggregateId = String(params[1] ?? '');
      const version = Number(params[2] ?? 0);
      const row = this.events.find(
        (event) =>
          event.aggregate_type === aggregateType &&
          event.aggregate_id === aggregateId &&
          event.version === version
      );
      return row ? ([{ id: row.id }] as unknown as T[]) : [];
    }
    if (
      normalized.startsWith(
        'SELECT EVENT_ID FROM SYNC_EVENT_MAP WHERE EVENT_ID = ?'
      )
    ) {
      const id = String(params[0] ?? '');
      const row = this.getEventMap(id);
      return row ? ([{ event_id: row.event_id }] as unknown as T[]) : [];
    }
    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<void> {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('INSERT OR IGNORE INTO SYNC_META')) {
      const storeId = String(params[0] ?? '');
      if (!this.getSyncMeta(storeId)) {
        this.syncMeta.push({
          store_id: storeId,
          last_pulled_global_seq: Number(params[1] ?? 0),
          updated_at: Number(params[2] ?? 0),
        });
      }
      return;
    }
    if (normalized.startsWith('INSERT INTO SYNC_META')) {
      const storeId = String(params[0] ?? '');
      const existing = this.getSyncMeta(storeId);
      const row: SyncMetaRow = {
        store_id: storeId,
        last_pulled_global_seq: Number(params[1] ?? 0),
        updated_at: Number(params[2] ?? 0),
      };
      if (existing) {
        this.syncMeta = this.syncMeta.map((item) =>
          item.store_id === storeId ? row : item
        );
      } else {
        this.syncMeta.push(row);
      }
      return;
    }
    await this.executeStatement(sql, params);
  }

  async batch(
    statements: ReadonlyArray<SqliteStatement>
  ): Promise<ReadonlyArray<SqliteBatchResult>> {
    const results: SqliteBatchResult[] = [];
    for (const statement of statements) {
      if (statement.kind === SqliteStatementKinds.query) {
        const rows = await this.query(statement.sql, statement.params ?? []);
        results.push({ kind: SqliteStatementKinds.query, rows });
        continue;
      }
      await this.executeStatement(statement.sql, statement.params ?? []);
      results.push({ kind: SqliteStatementKinds.execute });
    }
    return results;
  }

  subscribeToTables(): () => void {
    return () => undefined;
  }

  private async executeStatement(
    sql: string,
    params: ReadonlyArray<SqliteValue>
  ): Promise<void> {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('INSERT OR IGNORE INTO EVENTS')) {
      const [
        id,
        aggregateType,
        aggregateId,
        eventType,
        payloadEncrypted,
        keyringUpdate,
        version,
        occurredAt,
        actorId,
        causationId,
        correlationId,
        epoch,
      ] = params;
      if (this.events.some((row) => row.id === id)) {
        return;
      }
      if (
        this.events.some(
          (row) =>
            row.aggregate_type === String(aggregateType) &&
            row.aggregate_id === String(aggregateId) &&
            row.version === Number(version)
        )
      ) {
        // Simulate the `events_aggregate_version` unique index.
        return;
      }
      const payload = toUint8Array(payloadEncrypted, 'payload_encrypted');
      const keyring = toNullableUint8Array(keyringUpdate, 'keyring_update');
      this.commitSequence += 1;
      this.events.push({
        id: String(id),
        aggregate_type: String(aggregateType),
        aggregate_id: String(aggregateId),
        event_type: String(eventType),
        payload_encrypted: payload,
        keyring_update: keyring,
        version: Number(version),
        occurred_at: Number(occurredAt),
        actor_id: actorId === null ? null : String(actorId),
        causation_id: causationId === null ? null : String(causationId),
        correlation_id: correlationId === null ? null : String(correlationId),
        epoch: epoch === null ? null : Number(epoch),
        commit_sequence: this.commitSequence,
      });
      return;
    }
    if (normalized.startsWith('INSERT OR IGNORE INTO SYNC_EVENT_MAP')) {
      const [eventId, globalSeq, insertedAt] = params;
      if (this.syncEventMap.some((row) => row.event_id === eventId)) {
        return;
      }
      this.syncEventMap.push({
        event_id: String(eventId),
        global_seq: Number(globalSeq),
        inserted_at: Number(insertedAt),
      });
      return;
    }
    throw new Error(`Unhandled batch statement: ${sql}`);
  }

  private pendingEvents(): EventRow[] {
    return this.events.filter(
      (row) => !this.syncEventMap.some((map) => map.event_id === row.id)
    );
  }
}

class TestDb extends MemoryDb {
  private subscribers: Array<() => void> = [];

  subscribeToTables(
    _tables?: ReadonlyArray<string>,
    onChange?: () => void
  ): () => void {
    if (!onChange) return () => undefined;
    this.subscribers.push(onChange);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== onChange);
    };
  }

  emitTableChange(): void {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}

class FakeTransport implements SyncTransportPort {
  pullResponses: SyncPullResponseV1[] = [];
  pushResponses: Array<SyncPushOkResponseV1 | SyncPushConflictResponseV1> = [];
  pushRequests: SyncPushRequestV1[] = [];

  async push(
    request: SyncPushRequestV1,
    _options?: Readonly<{ signal?: AbortSignal }>
  ): Promise<SyncPushOkResponseV1 | SyncPushConflictResponseV1> {
    this.pushRequests.push(request);
    const response = this.pushResponses.shift();
    if (!response) {
      throw new Error('No push response queued');
    }
    return response;
  }

  async pull(params: {
    storeId: string;
    since: number;
    limit: number;
    waitMs?: number;
    signal?: AbortSignal;
  }): Promise<SyncPullResponseV1> {
    const response = this.pullResponses.shift();
    if (!response) {
      return {
        head: params.since,
        events: [],
        hasMore: false,
        nextSince: null,
      };
    }
    return response;
  }

  async ping(): Promise<void> {}
}

const normalizeSql = (sql: string): string =>
  sql.replace(/\s+/g, ' ').trim().toUpperCase();

const toUint8Array = (value: SqliteValue, label: string): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  throw new Error(`Expected ${label} to be Uint8Array`);
};

const toNullableUint8Array = (
  value: SqliteValue,
  label: string
): Uint8Array | null => {
  if (value === null) return null;
  if (value instanceof Uint8Array) return value;
  throw new Error(`Expected ${label} to be Uint8Array or null`);
};

const makeRecordJson = (params: {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
}): string =>
  JSON.stringify({
    id: params.id,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType,
    payload: encodeBase64Url(params.payload),
    version: params.version,
    occurredAt: Date.now(),
    actorId: null,
    causationId: null,
    correlationId: null,
    epoch: null,
    keyringUpdate: null,
  });

describe('SyncEngine', () => {
  it('rewrites pending versions to avoid per-aggregate version collisions when applying remote events', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const storeId = 'store-collision';

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    transport.pullResponses.push({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.pushResponses.push({
      ok: false,
      head: 1,
      reason: 'server_ahead',
      missing: [
        {
          globalSequence: 1,
          eventId: 'remote-1',
          recordJson: makeRecordJson({
            id: 'remote-1',
            aggregateType: 'goal',
            aggregateId: 'goal-1',
            eventType: 'GoalCreated',
            payload: new Uint8Array([9]),
            version: 1,
          }),
        },
      ],
    });
    transport.pushResponses.push({
      ok: true,
      head: 2,
      assigned: [{ eventId: 'local-1', globalSequence: 2 }],
    });

    const pendingVersionRewriter = {
      rewritePendingVersions: async (request: {
        aggregateType: string;
        aggregateId: string;
        fromVersionInclusive: number;
      }): Promise<{
        aggregateType: string;
        aggregateId: string;
        fromVersionInclusive: number;
        shiftedCount: number;
        oldMaxVersion: number | null;
        newMaxVersion: number | null;
      }> => {
        db.shiftPendingVersions(request);
        return {
          aggregateType: request.aggregateType,
          aggregateId: request.aggregateId,
          fromVersionInclusive: request.fromVersionInclusive,
          shiftedCount: 1,
          oldMaxVersion: 1,
          newMaxVersion: 2,
        };
      },
    };

    const engine = new SyncEngine({
      db,
      transport,
      storeId,
      onRebaseRequired,
      pendingVersionRewriter,
    });

    await engine.syncOnce();

    expect(db.getEvent('remote-1')?.version).toBe(1);
    expect(db.getEvent('local-1')?.version).toBe(2);
    expect(db.getEventMap('remote-1')?.global_seq).toBe(1);
    expect(db.getEventMap('local-1')?.global_seq).toBe(2);
  });

  it('pushes pending events in commitSequence order (not causation/correlation)', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const storeId = 'store-ordering';

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      // Intentionally points "forward" to demonstrate that we do NOT topologically sort.
      causation_id: 'local-2',
      correlation_id: 'corr-1',
      epoch: null,
    });

    db.seedEvent({
      id: 'local-2',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalRefined',
      payload_encrypted: new Uint8Array([2]),
      keyring_update: null,
      version: 2,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: 'corr-1',
      epoch: null,
    });

    transport.pullResponses.push({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.pushResponses.push({
      ok: true,
      head: 2,
      assigned: [
        { eventId: 'local-1', globalSequence: 1 },
        { eventId: 'local-2', globalSequence: 2 },
      ],
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId,
      onRebaseRequired,
      pushBatchSize: 10,
    });

    await engine.syncOnce();

    expect(transport.pushRequests).toHaveLength(1);
    expect(
      transport.pushRequests[0]?.events.map((event) => event.eventId)
    ).toEqual(['local-1', 'local-2']);
  });

  it('runs pull/push loops and respects interval sleep', async () => {
    vi.useFakeTimers();
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const storeId = 'store-loop';
    let pullCalls = 0;
    let pushCalls = 0;

    transport.pull = async () => {
      pullCalls += 1;
      return { head: pullCalls, events: [], hasMore: false, nextSince: null };
    };
    transport.push = async () => {
      pushCalls += 1;
      return { ok: true, head: 0, assigned: [] };
    };

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId,
      onRebaseRequired,
      pullIntervalMs: 5,
      pushIntervalMs: 5,
      pullWaitMs: 0,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(20);
    engine.stop();
    vi.useRealTimers();
    await Promise.resolve();

    expect(pullCalls).toBeGreaterThan(0);
    expect(pushCalls).toBeGreaterThan(0);
  });

  it('honors pull backoff retryAt before retrying', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    let pullCalls = 0;

    transport.pull = async () => {
      pullCalls += 1;
      if (pullCalls === 1) {
        throw new Error('pull failed');
      }
      return { head: 1, events: [], hasMore: false, nextSince: null };
    };

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-backoff',
      onRebaseRequired,
      pullIntervalMs: 0,
      pullWaitMs: 0,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(pullCalls).toBe(1);
    expect(engine.getStatus().kind).toBe('error');

    await vi.advanceTimersByTimeAsync(998);
    expect(pullCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(2);
    await Promise.resolve();
    expect(pullCalls).toBeGreaterThanOrEqual(2);

    engine.stop();
    randomMock.mockRestore();
    vi.useRealTimers();
  });

  it('honors push backoff retryAt before retrying', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    let pushCalls = 0;

    transport.pullResponses.push({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.push = async () => {
      pushCalls += 1;
      if (pushCalls === 1) {
        throw new Error('push failed');
      }
      return { ok: true, head: 1, assigned: [] };
    };

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-push-backoff',
      onRebaseRequired,
      pushIntervalMs: 0,
      pullIntervalMs: 0,
      pullWaitMs: 0,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(pushCalls).toBe(1);
    expect(engine.getStatus().kind).toBe('error');

    await vi.advanceTimersByTimeAsync(998);
    expect(pushCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(2);
    await Promise.resolve();
    expect(pushCalls).toBeGreaterThanOrEqual(2);

    engine.stop();
    randomMock.mockRestore();
    vi.useRealTimers();
  });

  it('debounces push signals into a single request', async () => {
    vi.useFakeTimers();
    const db = new TestDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    let pushCalls = 0;

    transport.pull = async () => ({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.push = async () => {
      pushCalls += 1;
      return {
        ok: true,
        head: 1,
        assigned: [{ eventId: 'local-1', globalSequence: 1 }],
      };
    };

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-debounce',
      onRebaseRequired,
      pushIntervalMs: 0,
      pullIntervalMs: 0,
      pullWaitMs: 0,
    });

    engine.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    db.emitTableChange();
    db.emitTableChange();
    db.emitTableChange();

    await vi.advanceTimersByTimeAsync(99);
    expect(pushCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(pushCalls).toBe(1);

    engine.stop();
    vi.useRealTimers();
  });

  it('uses fallback push interval after signals are seen', async () => {
    vi.useFakeTimers();
    const db = new TestDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    let pushCalls = 0;

    transport.pull = async () => ({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.push = async () => {
      pushCalls += 1;
      return {
        ok: true,
        head: 1,
        assigned: [{ eventId: 'local-1', globalSequence: 1 }],
      };
    };

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-fallback',
      onRebaseRequired,
      pushIntervalMs: 1000,
      pushFallbackIntervalMs: 50,
      pullIntervalMs: 0,
      pullWaitMs: 0,
    });

    engine.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    db.emitTableChange();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(pushCalls).toBe(0);

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    await vi.advanceTimersByTimeAsync(49);
    expect(pushCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(pushCalls).toBe(1);

    engine.stop();
    vi.useRealTimers();
  });

  it('pulls remote events, writes mappings, and triggers rebase when pending exists', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const storeId = 'store-1';

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1, 2, 3]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    transport.pullResponses.push({
      head: 1,
      events: [
        {
          globalSequence: 1,
          eventId: 'remote-1',
          recordJson: makeRecordJson({
            id: 'remote-1',
            aggregateType: 'goal',
            aggregateId: 'goal-2',
            eventType: 'GoalCreated',
            payload: new Uint8Array([9, 9, 9]),
            version: 1,
          }),
        },
      ],
      hasMore: false,
      nextSince: 1,
    });
    transport.pushResponses.push({
      ok: true,
      head: 2,
      assigned: [{ eventId: 'local-1', globalSequence: 2 }],
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId,
      onRebaseRequired,
    });

    await engine.syncOnce();

    expect(onRebaseRequired).toHaveBeenCalledTimes(1);
    expect(db.getEventMap('remote-1')?.global_seq).toBe(1);
    expect(db.getEventMap('local-1')?.global_seq).toBe(2);
    expect(db.getSyncMeta(storeId)?.last_pulled_global_seq).toBe(2);
  });

  it('applies missing events on conflict and retries push', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const storeId = 'store-1';

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1, 2, 3]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    transport.pullResponses.push({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.pushResponses.push({
      ok: false,
      head: 1,
      reason: 'server_ahead',
      missing: [
        {
          globalSequence: 1,
          eventId: 'remote-1',
          recordJson: makeRecordJson({
            id: 'remote-1',
            aggregateType: 'goal',
            aggregateId: 'goal-2',
            eventType: 'GoalCreated',
            payload: new Uint8Array([9, 9, 9]),
            version: 1,
          }),
        },
      ],
    });
    transport.pushResponses.push({
      ok: true,
      head: 2,
      assigned: [{ eventId: 'local-1', globalSequence: 2 }],
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId,
      onRebaseRequired,
    });

    await engine.syncOnce();

    expect(onRebaseRequired).toHaveBeenCalledTimes(1);
    expect(db.getEventMap('remote-1')?.global_seq).toBe(1);
    expect(db.getEventMap('local-1')?.global_seq).toBe(2);
    expect(db.getSyncMeta(storeId)?.last_pulled_global_seq).toBe(2);
    expect(transport.pushRequests).toHaveLength(2);
  });

  it('sets error when pull response hasMore without nextSince', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const statusHistory: SyncStatus[] = [];

    transport.pullResponses.push({
      head: 1,
      events: [
        {
          globalSequence: 1,
          eventId: 'remote-1',
          recordJson: makeRecordJson({
            id: 'remote-1',
            aggregateType: 'goal',
            aggregateId: 'goal-1',
            eventType: 'GoalCreated',
            payload: new Uint8Array([1]),
            version: 1,
          }),
        },
      ],
      hasMore: true,
      nextSince: null,
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-2',
      onRebaseRequired,
      onStatusChange: (status) => statusHistory.push(status),
    });

    await engine.syncOnce();

    expect(statusHistory.some((status) => status.kind === 'error')).toBe(true);
  });

  it('sets error when conflict does not advance cursor', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1, 2, 3]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    transport.pullResponses.push({
      head: 5,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.pushResponses.push({
      ok: false,
      head: 6,
      reason: 'server_ahead',
    });
    transport.pullResponses.push({
      head: 5,
      events: [],
      hasMore: false,
      nextSince: null,
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-3',
      onRebaseRequired,
    });

    await engine.syncOnce();

    expect(engine.getStatus().kind).toBe('error');
  });

  it('sets error when remote record id mismatches event id', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);
    const statusHistory: SyncStatus[] = [];

    transport.pullResponses.push({
      head: 1,
      events: [
        {
          globalSequence: 1,
          eventId: 'remote-1',
          recordJson: makeRecordJson({
            id: 'different-id',
            aggregateType: 'goal',
            aggregateId: 'goal-1',
            eventType: 'GoalCreated',
            payload: new Uint8Array([1]),
            version: 1,
          }),
        },
      ],
      hasMore: false,
      nextSince: 1,
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-4',
      onRebaseRequired,
      onStatusChange: (status) => statusHistory.push(status),
    });

    await engine.syncOnce();

    expect(statusHistory.some((status) => status.kind === 'error')).toBe(true);
  });

  it('handles push ok with empty assignments', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1, 2, 3]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    transport.pullResponses.push({
      head: 0,
      events: [],
      hasMore: false,
      nextSince: null,
    });
    transport.pushResponses.push({
      ok: true,
      head: 0,
      assigned: [],
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-5',
      onRebaseRequired,
    });

    await engine.syncOnce();

    expect(engine.getStatus().kind).toBe('idle');
  });

  it('falls back to last_pulled_global_seq when head is unknown', async () => {
    const db = new MemoryDb();
    const transport = new FakeTransport();
    const onRebaseRequired = vi.fn().mockResolvedValue(undefined);

    db.seedEvent({
      id: 'local-1',
      aggregate_type: 'goal',
      aggregate_id: 'goal-1',
      event_type: 'GoalCreated',
      payload_encrypted: new Uint8Array([1, 2, 3]),
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });

    const pullError = new Error('pull failed');
    transport.pull = vi.fn(async () => {
      throw pullError;
    });
    transport.pushResponses.push({
      ok: true,
      head: 0,
      assigned: [{ eventId: 'local-1', globalSequence: 1 }],
    });

    const engine = new SyncEngine({
      db,
      transport,
      storeId: 'store-6',
      onRebaseRequired,
    });

    await engine.syncOnce();

    expect(transport.pull).toHaveBeenCalledTimes(1);
    expect(transport.pushRequests[0]?.expectedHead).toBe(0);
    expect(engine.getStatus().kind).toBe('idle');
  });
});
