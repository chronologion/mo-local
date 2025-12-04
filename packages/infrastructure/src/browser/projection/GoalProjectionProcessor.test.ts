import { describe, expect, it, beforeEach } from 'vitest';
import { GoalProjectionProcessor } from './GoalProjectionProcessor';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import { DomainToLiveStoreAdapter } from '../../livestore/adapters/DomainToLiveStoreAdapter';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import { GoalCreated, GoalDeleted, GoalTargetChanged } from '@mo/domain';
import { EncryptedEvent, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';

class InMemoryKeyStore {
  private readonly keys = new Map<string, Uint8Array>();
  setMasterKey(): void {
    // noop for tests
  }
  async saveAggregateKey(id: string, key: Uint8Array): Promise<void> {
    this.keys.set(id, key);
  }
  async getAggregateKey(id: string): Promise<Uint8Array | null> {
    return this.keys.get(id) ?? null;
  }
}

type SnapshotRow = {
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

type AnalyticsRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
  updated_at: number;
};

class StoreStub {
  snapshots = new Map<string, SnapshotRow>();
  analytics: AnalyticsRow | null = null;
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
    if (query.includes('FROM goal_snapshots') && !query.includes('WHERE')) {
      return [...this.snapshots.entries()].map(([aggregateId, row]) => ({
        aggregate_id: aggregateId,
        ...row,
      })) as unknown as TResult;
    }
    if (query.includes('FROM goal_snapshots WHERE aggregate_id')) {
      const id = bindValues[0] as string;
      const row = this.snapshots.get(id);
      return (row ? [row] : []) as TResult;
    }
    if (query.includes('FROM goal_analytics WHERE aggregate_id')) {
      return (this.analytics ? [this.analytics] : []) as TResult;
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
    if (query.includes('FROM goal_projection_meta')) {
      const key = bindValues[0] as string;
      const value = this.meta.get(key);
      return (value ? [{ value }] : []) as TResult;
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
        name: 'goal.event',
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

class EventStoreStub implements IEventStore {
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

const decodeSnapshot = async (
  crypto: WebCryptoService,
  cipher: Uint8Array,
  aggregateId: string,
  version: number,
  key: Uint8Array
) => {
  const aad = new TextEncoder().encode(`${aggregateId}:snapshot:${version}`);
  const plaintext = await crypto.decrypt(cipher, key, aad);
  return JSON.parse(new TextDecoder().decode(plaintext)) as {
    targetMonth: string;
    slice: string;
  };
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
  const goalId = 'goal-1';
  let crypto: WebCryptoService;
  let keyStore: InMemoryKeyStore;
  let store: StoreStub;

  beforeEach(() => {
    crypto = new WebCryptoService();
    keyStore = new InMemoryKeyStore();
    store = new StoreStub();
  });

  it('projects events into encrypted snapshots and analytics', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated({
        goalId,
        slice: 'Health',
        summary: 'Run',
        targetMonth: '2025-12',
        priority: 'must',
        createdBy: 'user-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
      1,
      kGoal
    );
    const targetChanged = await toEncrypted.toEncrypted(
      new GoalTargetChanged({
        goalId,
        targetMonth: '2026-01',
        changedAt: new Date('2025-02-01T00:00:00Z'),
      }),
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
      keyStore as unknown as InMemoryKeyStore,
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

  it('removes snapshots and projection entries when a goal is deleted', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated({
        goalId,
        slice: 'Health',
        summary: 'Run',
        targetMonth: '2025-12',
        priority: 'must',
        createdBy: 'user-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
      1,
      kGoal
    );
    const deleted = await toEncrypted.toEncrypted(
      new GoalDeleted({
        goalId,
        deletedAt: new Date('2025-03-01T00:00:00Z'),
      }),
      2,
      kGoal
    );
    const events: EncryptedEvent[] = [
      { ...created, sequence: 1 },
      { ...deleted, sequence: 2 },
    ];
    const eventStore = new EventStoreStub(events);
    store.eventLog = events;
    const processor = new GoalProjectionProcessor(
      store as unknown as Store,
      eventStore,
      crypto,
      keyStore as unknown as InMemoryKeyStore,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();

    expect(store.snapshots.size).toBe(0);
    expect(processor.listGoals()).toHaveLength(0);
    expect(processor.getGoalById(goalId)).toBeNull();
  });

  it('rebuilds projections from scratch on reset', async () => {
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(goalId, kGoal);
    const toEncrypted = new DomainToLiveStoreAdapter(crypto);
    const created = await toEncrypted.toEncrypted(
      new GoalCreated({
        goalId,
        slice: 'Health',
        summary: 'Run',
        targetMonth: '2025-12',
        priority: 'must',
        createdBy: 'user-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
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
      keyStore as unknown as InMemoryKeyStore,
      new LiveStoreToDomainAdapter(crypto)
    );

    await processor.start();
    expect(processor.listGoals()).toHaveLength(1);
    await processor.resetAndRebuild();
    expect(processor.listGoals()).toHaveLength(1);
    expect(store.snapshots.size).toBe(1);
  });
});
