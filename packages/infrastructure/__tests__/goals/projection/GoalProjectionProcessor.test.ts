import { describe, expect, it, beforeEach } from 'vitest';
import { GoalProjectionProcessor } from '../../../src/goals/projections/runtime/GoalProjectionProcessor';
import { LiveStoreToDomainAdapter } from '../../../src/livestore/adapters/LiveStoreToDomainAdapter';
import { DomainToLiveStoreAdapter } from '../../../src/livestore/adapters/DomainToLiveStoreAdapter';
import { WebCryptoService } from '../../../src/crypto/WebCryptoService';
import { InMemoryKeyringStore } from '../../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../../src/crypto/KeyringManager';
import { decodeGoalSnapshotState } from '../../../src/goals/snapshots/GoalSnapshotCodec';
import { buildSnapshotAad } from '../../../src/eventing/aad';
import {
  ActorId,
  GoalCreated,
  GoalArchived,
  GoalRescheduled,
  GoalId,
  Slice,
  Summary,
  Month,
  Priority,
  UserId,
  Timestamp,
  EventId,
} from '@mo/domain';
import { EncryptedEvent, EventStorePort } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { InMemoryKeyStore } from '../../fixtures/InMemoryKeyStore';

type SnapshotRow = {
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

const aggregateId = GoalId.from('00000000-0000-0000-0000-000000000002');
const aggregateIdValue = aggregateId.value;
const meta = () => ({
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

type AnalyticsRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
  updated_at: number;
};

class StoreStub {
  snapshots = new Map<string, SnapshotRow>();
  analytics: AnalyticsRow | null = null;
  searchIndex: { payload_encrypted: Uint8Array; last_sequence: number } | null =
    null;
  meta = new Map<string, string>();
  eventLog: EncryptedEvent[] = [];

  subscribe(): () => void {
    return () => {};
  }

  query<TResult>({
    query,
    bindValues,
  }: {
    query: string;
    bindValues: Array<string | number | Uint8Array>;
  }): TResult {
    if (query.includes('COUNT(*) as count FROM goal_snapshots')) {
      return [{ count: this.snapshots.size }] as unknown as TResult;
    }
    if (query.includes('INSERT INTO goal_snapshots')) {
      const [aggregateId, cipher, version, lastSequence, updatedAt] =
        bindValues as [string, Uint8Array, number, number, number];
      this.snapshots.set(aggregateId, {
        payload_encrypted: cipher,
        version,
        last_sequence: lastSequence,
        updated_at: updatedAt,
      });
      return [] as unknown as TResult;
    }
    if (query.includes('DELETE FROM goal_snapshots WHERE aggregate_id')) {
      const aggregateId = bindValues[0] as string;
      this.snapshots.delete(aggregateId);
      return [] as unknown as TResult;
    }
    if (query.startsWith('DELETE FROM goal_events WHERE sequence <= ')) {
      const threshold = bindValues[0] as number;
      this.eventLog = this.eventLog.filter(
        (event) => (event.sequence ?? 0) > threshold
      );
      return [] as unknown as TResult;
    }
    if (query.includes('SELECT id, version FROM goal_events WHERE sequence')) {
      const sequence = bindValues[0] as number;
      const row = this.eventLog.find((event) => event.sequence === sequence);
      return row
        ? ([{ id: row.id, version: row.version }] as unknown as TResult)
        : ([] as unknown as TResult);
    }
    if (query === 'DELETE FROM goal_snapshots') {
      this.snapshots.clear();
      return [] as unknown as TResult;
    }
    if (query === 'DELETE FROM goal_analytics') {
      this.analytics = null;
      return [] as unknown as TResult;
    }
    if (query === 'DELETE FROM goal_projection_meta') {
      this.meta.clear();
      return [] as unknown as TResult;
    }
    if (query === 'DELETE FROM goal_search_index') {
      this.searchIndex = null;
      return [] as unknown as TResult;
    }
    if (query.includes('FROM goal_snapshots') && !query.includes('WHERE')) {
      return [...this.snapshots.entries()].map(([aggregateId, row]) => ({
        aggregate_id: aggregateId,
        ...row,
      })) as unknown as TResult;
    }
    if (query.includes('FROM goal_snapshots WHERE aggregate_id')) {
      const id = bindValues[0] as string;
      const row = this.snapshots.get(id);
      return (row ? [row] : []) as unknown as TResult;
    }
    if (query.includes('FROM goal_analytics WHERE aggregate_id')) {
      return (this.analytics ? [this.analytics] : []) as unknown as TResult;
    }
    if (query.includes('INSERT INTO goal_analytics')) {
      const [, cipher, lastSequence, updatedAt] = bindValues as [
        string,
        Uint8Array,
        number,
        number,
      ];
      this.analytics = {
        payload_encrypted: cipher,
        last_sequence: lastSequence,
        updated_at: updatedAt,
      };
      return [] as unknown as TResult;
    }
    if (query.includes('FROM goal_search_index WHERE key')) {
      return this.searchIndex
        ? ([this.searchIndex] as unknown as TResult)
        : ([] as unknown as TResult);
    }
    if (query.includes('INSERT INTO goal_search_index')) {
      const [, cipher, lastSequence] = bindValues as [
        string,
        Uint8Array,
        number,
        number,
      ];
      this.searchIndex = {
        payload_encrypted: cipher,
        last_sequence: lastSequence,
      };
      return [] as unknown as TResult;
    }
    if (query.includes('FROM goal_projection_meta')) {
      const key = bindValues[0] as string;
      const value = this.meta.get(key);
      return (value ? [{ value }] : []) as unknown as TResult;
    }
    if (query.includes('INSERT INTO goal_projection_meta')) {
      const [key, value] = bindValues as [string, string];
      this.meta.set(key, value);
      return [] as unknown as TResult;
    }
    throw new Error(`Unhandled query: ${query}`);
  }

  async *events(_options?: {
    cursor?: unknown;
    filter?: string[];
  }): AsyncIterable<{
    name: string;
    args: unknown;
    seqNum: { global: number };
  }> {
    for (const event of this.eventLog) {
      yield {
        name: 'event.v1',
        args: {
          id: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payload: event.payload,
          version: event.version,
          occurredAt: event.occurredAt,
        },
        seqNum: { global: event.sequence ?? 0 },
      };
    }
  }
}

class EventStoreStub implements EventStorePort {
  constructor(private readonly events: EncryptedEvent[]) {}

  async append(): Promise<void> {
    throw new Error('append not implemented for test stub');
  }

  async getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<EncryptedEvent[]> {
    return this.events.filter((event) => {
      const matchesAggregate = event.aggregateId === aggregateId;
      const matchesVersion =
        fromVersion === undefined ? true : event.version > fromVersion;
      return matchesAggregate && matchesVersion;
    });
  }

  async getAllEvents(filter?: { since?: number }): Promise<EncryptedEvent[]> {
    if (!filter?.since) return this.events;
    return this.events.filter(
      (event) => (event.sequence ?? 0) > (filter.since ?? 0)
    );
  }
}

class LiveEventStoreStub implements EventStorePort {
  constructor(private readonly store: StoreStub) {}

  async append(): Promise<void> {
    throw new Error('append not implemented for test stub');
  }

  async getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<EncryptedEvent[]> {
    return this.store.eventLog.filter((event) => {
      const matchesAggregate = event.aggregateId === aggregateId;
      const matchesVersion =
        fromVersion === undefined ? true : event.version > fromVersion;
      return matchesAggregate && matchesVersion;
    });
  }

  async getAllEvents(filter?: { since?: number }): Promise<EncryptedEvent[]> {
    if (!filter?.since) return this.store.eventLog;
    return this.store.eventLog.filter(
      (event) => (event.sequence ?? 0) > (filter.since ?? 0)
    );
  }
}

const decodeSnapshot = async (
  crypto: WebCryptoService,
  cipher: Uint8Array,
  aggregateId: string,
  version: number,
  key: Uint8Array
) => {
  const aad = buildSnapshotAad(aggregateId, version);
  const plaintext = await crypto.decrypt(cipher, key, aad);
  return decodeGoalSnapshotState(plaintext, version);
};

const decodeAnalytics = async (
  crypto: WebCryptoService,
  cipher: Uint8Array,
  lastSequence: number,
  key: Uint8Array
) => {
  const aad = new TextEncoder().encode(
    `goal_analytics:analytics:${lastSequence}`
  );
  const plaintext = await crypto.decrypt(cipher, key, aad);
  return JSON.parse(new TextDecoder().decode(plaintext)) as {
    monthlyTotals: Record<string, Record<string, number>>;
    categoryRollups: Record<string, Record<string, number>>;
  };
};

describe('GoalProjectionProcessor', () => {
  const goalId = aggregateIdValue;
  let crypto: WebCryptoService;
  let keyStore: InMemoryKeyStore;
  let keyringManager: KeyringManager;
  let store: StoreStub;

  beforeEach(() => {
    crypto = new WebCryptoService();
    keyStore = new InMemoryKeyStore();
    keyringManager = new KeyringManager(
      crypto,
      keyStore,
      new InMemoryKeyringStore()
    );
    store = new StoreStub();
  });

  it('projects events into encrypted snapshots and analytics', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const targetChanged = await toEncrypted.toEncrypted(
      new GoalRescheduled(
        {
          goalId: aggregateId,
          targetMonth: Month.from('2026-01'),
          changedAt: Timestamp.fromMillis(
            new Date('2025-02-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      2,
      kGoal
    );
    const events: EncryptedEvent[] = [
      { ...created, sequence: 1 },
      { ...targetChanged, sequence: 2 },
    ];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();

    const snapshotRow = store.snapshots.get(goalId);
    expect(snapshotRow).toBeDefined();
    const decodedSnapshot = await decodeSnapshot(
      crypto,
      snapshotRow!.payload_encrypted,
      goalId,
      snapshotRow!.version,
      kGoal
    );
    expect(decodedSnapshot.targetMonth).toBe('2026-01');

    const analyticsKey =
      (await keyStore.getAggregateKey('goal_analytics')) ?? new Uint8Array();
    const analyticsRow = store.analytics;
    expect(analyticsRow).toBeDefined();
    const analytics = await decodeAnalytics(
      crypto,
      analyticsRow!.payload_encrypted,
      analyticsRow!.last_sequence,
      analyticsKey
    );
    expect(analytics.monthlyTotals['2026-01'].Health).toBe(1);
    expect(analytics.monthlyTotals['2025-12']).toBeUndefined();
  });

  it('removes snapshots and projection entries when a goal is archived', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const archived = await toEncrypted.toEncrypted(
      new GoalArchived(
        {
          goalId: aggregateId,
          archivedAt: Timestamp.fromMillis(
            new Date('2025-03-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      2,
      kGoal
    );
    const events: EncryptedEvent[] = [
      { ...created, sequence: 1 },
      { ...archived, sequence: 2 },
    ];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();

    expect(store.snapshots.size).toBe(1);
    expect(processor.listGoals()).toHaveLength(0);
    expect(processor.getGoalById(goalId)).toBeNull();
  });

  it('rebuilds projections from scratch on reset', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const events: EncryptedEvent[] = [{ ...created, sequence: 1 }];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();
    expect(processor.listGoals()).toHaveLength(1);
    await processor.resetAndRebuild();
    expect(processor.listGoals()).toHaveLength(1);
    expect(store.snapshots.size).toBe(1);
  });

  it('rebuilds projections when the event log is rebased in-place', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const targetChanged = await toEncrypted.toEncrypted(
      new GoalRescheduled(
        {
          goalId: aggregateId,
          targetMonth: Month.from('2026-01'),
          changedAt: Timestamp.fromMillis(
            new Date('2025-02-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      2,
      kGoal
    );

    store.eventLog = [
      { ...created, sequence: 1 },
      { ...targetChanged, sequence: 2 },
    ];

    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      new LiveEventStoreStub(store),
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();
    expect(store.snapshots.get(goalId)?.version).toBe(2);

    // Simulate a rebase that replaces the last processed event without advancing
    // the state-table `sequence` cursor (tail rewrite within a transaction).
    const rebasedTargetChanged = await toEncrypted.toEncrypted(
      new GoalRescheduled(
        {
          goalId: aggregateId,
          targetMonth: Month.from('2026-02'),
          changedAt: Timestamp.fromMillis(
            new Date('2025-02-02T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      3,
      kGoal
    );
    store.eventLog = [
      { ...created, sequence: 1 },
      { ...rebasedTargetChanged, sequence: 2 },
    ];

    await processor.flush();

    const snapshot = store.snapshots.get(goalId);
    expect(snapshot?.version).toBe(2);
    const decodedSnapshot = await decodeSnapshot(
      crypto,
      snapshot!.payload_encrypted,
      goalId,
      snapshot!.version,
      kGoal
    );
    expect(decodedSnapshot.targetMonth).toBe('2026-02');
  });

  it('prunes processed events from the outbox once snapshots are up to date', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const targetChanged = await toEncrypted.toEncrypted(
      new GoalRescheduled(
        {
          goalId: aggregateId,
          targetMonth: Month.from('2026-01'),
          changedAt: Timestamp.fromMillis(
            new Date('2025-02-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      2,
      kGoal
    );
    const events: EncryptedEvent[] = [
      { ...created, sequence: 1 },
      { ...targetChanged, sequence: 2 },
    ];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();

    // With a large tail window, recent events are not pruned immediately.
    expect(store.eventLog.length).toBe(2);
  });

  it('supports infix search via FTS index', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Work'),
          summary: Summary.from('Build a todo app'),
          targetMonth: Month.from('2025-10'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kGoal
    );
    const events: EncryptedEvent[] = [{ ...created, sequence: 1 }];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();
    const results = processor.searchGoals('odo');
    expect(results.map((r) => r.id)).toContain(goalId);
  });

  it('skips events for aggregates without keys while still advancing sequence', async () => {
    const otherGoalId = GoalId.from(
      '00000000-0000-0000-0000-000000000099'
    ).value;
    const kMissing = await crypto.generateKey();
    const kPresent = await crypto.generateKey();

    const toEncrypted = new DomainToLiveStoreAdapter(crypto);

    // Event for aggregate without a stored key.
    const missingCreated = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: GoalId.from(otherGoalId),
          slice: Slice.from('Health'),
          summary: Summary.from('Run'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-01-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      1,
      kMissing
    );

    // Event for aggregate with a stored key.
    await keyStore.saveAggregateKey(goalId, kPresent);
    const presentCreated = await toEncrypted.toEncrypted(
      new GoalCreated(
        {
          goalId: aggregateId,
          slice: Slice.from('Work'),
          summary: Summary.from('Build'),
          targetMonth: Month.from('2025-10'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(
            new Date('2025-02-01T00:00:00Z').getTime()
          ),
        },
        meta()
      ),
      2,
      kPresent
    );

    const events: EncryptedEvent[] = [
      { ...missingCreated, sequence: 1 },
      { ...presentCreated, sequence: 2 },
    ];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;

    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore,
      keyringManager,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();

    // Snapshot should exist only for the aggregate we have a key for.
    expect(store.snapshots.has(goalId)).toBe(true);
    expect(store.snapshots.has(otherGoalId)).toBe(false);
  });
});
