import { describe, expect, it, beforeEach } from 'vitest';
import { GoalProjectionProcessor } from './GoalProjectionProcessor';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import { DomainToLiveStoreAdapter } from '../../livestore/adapters/DomainToLiveStoreAdapter';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import { GoalCreated, GoalTargetChanged } from '@mo/domain';
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
    if (query.includes('FROM goal_snapshots WHERE aggregate_id')) {
      const id = bindValues[0] as string;
      const row = this.snapshots.get(id);
      return (row ? [row] : []) as TResult;
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
}

class EventStoreStub implements IEventStore {
  constructor(private readonly events: EncryptedEvent[]) {}

  async append(): Promise<void> {
    throw new Error('append not implemented for test stub');
  }

  async getEvents(): Promise<EncryptedEvent[]> {
    return this.events;
  }

  async getAllEvents(): Promise<EncryptedEvent[]> {
    return this.events;
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
});
