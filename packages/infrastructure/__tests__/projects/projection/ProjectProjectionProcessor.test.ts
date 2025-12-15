import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectProjectionProcessor } from '../../../src/projects/projection/ProjectProjectionProcessor';
import { LiveStoreToDomainAdapter } from '../../../src/livestore/adapters/LiveStoreToDomainAdapter';
import { DomainToLiveStoreAdapter } from '../../../src/livestore/adapters/DomainToLiveStoreAdapter';
import { WebCryptoService } from '../../../src/crypto/WebCryptoService';
import type { IndexedDBKeyStore } from '../../../src/crypto/IndexedDBKeyStore';
import {
  ProjectCreated,
  ProjectStatusChanged,
  ProjectArchived,
  ProjectStatus,
  DomainEvent,
  ProjectId,
  ProjectName,
  ProjectDescription,
  LocalDate,
  Timestamp,
  UserId,
} from '@mo/domain';
import type { EncryptedEvent, IEventStore } from '@mo/application';
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

class StoreStub {
  snapshots = new Map<string, SnapshotRow>();
  searchIndex: { payload_encrypted: Uint8Array; last_sequence: number } | null =
    null;
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
    if (query.includes('INSERT INTO project_snapshots')) {
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
    if (
      query.includes('SELECT payload_encrypted, version FROM project_snapshots')
    ) {
      const aggregateId = bindValues[0] as string;
      const row = this.snapshots.get(aggregateId);
      return (row ? [row] : []) as unknown as TResult;
    }
    if (
      query.includes(
        'SELECT aggregate_id, payload_encrypted, version, last_sequence, updated_at FROM project_snapshots'
      )
    ) {
      const rows = [...this.snapshots.entries()].map(([aggregateId, row]) => ({
        aggregate_id: aggregateId,
        ...row,
      }));
      return rows as unknown as TResult;
    }
    if (query.includes('INSERT INTO project_projection_meta')) {
      const [, value] = bindValues as [string, string];
      this.meta.set('project_last_sequence', value as string);
      return [] as unknown as TResult;
    }
    if (query.includes('SELECT value FROM project_projection_meta')) {
      const value = this.meta.get('project_last_sequence');
      return (value ? [{ value }] : []) as unknown as TResult;
    }
    if (query.includes('INSERT INTO project_search_index')) {
      const [, payload, lastSequence] = bindValues as [
        string,
        Uint8Array,
        number,
      ];
      this.searchIndex = {
        payload_encrypted: payload,
        last_sequence: lastSequence,
      };
      return [] as unknown as TResult;
    }
    if (
      query.includes(
        'SELECT payload_encrypted, last_sequence FROM project_search_index'
      )
    ) {
      return this.searchIndex ? [this.searchIndex] : ([] as unknown as TResult);
    }
    if (query.startsWith('DELETE FROM project_events WHERE')) {
      // pruning handled by event store stub
      return [] as unknown as TResult;
    }
    return [] as unknown as TResult;
  }
}

class EventStoreStub implements IEventStore {
  private events: EncryptedEvent[] = [];

  async append(_aggregateId: string, events: EncryptedEvent[]): Promise<void> {
    this.events.push(
      ...events.map((event, idx) => ({
        ...event,
        sequence: (this.events.length + idx + 1) as number,
      }))
    );
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    return this.events
      .filter((e) => e.aggregateId === aggregateId && e.version >= fromVersion)
      .sort((a, b) => a.version - b.version);
  }

  async getAllEvents(filter?: {
    aggregateId?: string;
    eventType?: string;
    since?: number;
  }): Promise<EncryptedEvent[]> {
    return this.events
      .filter((e) => {
        if (filter?.aggregateId && e.aggregateId !== filter.aggregateId)
          return false;
        if (filter?.eventType && e.eventType !== filter.eventType) return false;
        if (filter?.since && (e.sequence ?? 0) <= filter.since) return false;
        return true;
      })
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }
}

describe('ProjectProjectionProcessor', () => {
  const crypto = new WebCryptoService();
  const toEncrypted = new DomainToLiveStoreAdapter(crypto);
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const store = new StoreStub() as unknown as Store;
  const keyStore = new InMemoryKeyStore();
  const eventStore = new EventStoreStub();
  const projectId = '00000000-0000-0000-0000-000000000301';

  beforeEach(async () => {
    (eventStore as EventStoreStub)['events'] = [];
    keyStore['keys'].clear();
    store.meta.clear();
    store.searchIndex = null;
    store.snapshots.clear();
    await keyStore.saveAggregateKey(projectId, await crypto.generateKey());
  });

  it('projects events into list and respects archive', async () => {
    const kProject = (await keyStore.getAggregateKey(projectId))!;
    const created = new ProjectCreated({
      projectId: ProjectId.from(projectId),
      name: ProjectName.from('Alpha'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.from('desc'),
      goalId: null,
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(
        new Date('2025-01-01T00:00:00Z').getTime()
      ),
    });
    const status = new ProjectStatusChanged({
      projectId: ProjectId.from(projectId),
      status: ProjectStatus.from('in_progress'),
      changedAt: Timestamp.fromMillis(
        new Date('2025-01-02T00:00:00Z').getTime()
      ),
    });
    const archived = new ProjectArchived({
      projectId: ProjectId.from(projectId),
      archivedAt: Timestamp.fromMillis(
        new Date('2025-01-03T00:00:00Z').getTime()
      ),
    });
    const events: DomainEvent[] = [created, status, archived];
    const encryptedBatch = await Promise.all(
      events.map((event, idx) =>
        toEncrypted.toEncrypted(event, idx + 1, kProject)
      )
    );
    await eventStore.append(projectId, encryptedBatch);

    const processor = new ProjectProjectionProcessor(
      store,
      eventStore,
      crypto,
      keyStore as unknown as IndexedDBKeyStore,
      toDomain
    );
    await processor.start();
    const listed = processor.listProjects();
    expect(listed).toHaveLength(0); // archived removes it
    expect(store.snapshots.size).toBeGreaterThan(0);
  });

  it('indexes projects for search', async () => {
    const kProject = (await keyStore.getAggregateKey(projectId))!;
    const created = new ProjectCreated({
      projectId: ProjectId.from(projectId),
      name: ProjectName.from('Build UI'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-03-01'),
      targetDate: LocalDate.fromString('2025-04-01'),
      description: ProjectDescription.from('Ship MVP'),
      goalId: null,
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(
        new Date('2025-03-01T00:00:00Z').getTime()
      ),
    });
    const encrypted = await toEncrypted.toEncrypted(created, 1, kProject);
    await eventStore.append(projectId, [encrypted]);

    const processor = new ProjectProjectionProcessor(
      store,
      eventStore,
      crypto,
      keyStore as unknown as IndexedDBKeyStore,
      toDomain
    );
    await processor.start();
    const results = await processor.searchProjects('build');
    expect(results.some((p) => p.id === projectId)).toBe(true);
  });

  it('can restart from snapshots when sequence differs from version', async () => {
    const projectA = '00000000-0000-0000-0000-000000000401';
    const projectB = '00000000-0000-0000-0000-000000000402';
    const kProjectA = await crypto.generateKey();
    const kProjectB = await crypto.generateKey();
    await keyStore.saveAggregateKey(projectA, kProjectA);
    await keyStore.saveAggregateKey(projectB, kProjectB);

    const createdA = new ProjectCreated({
      projectId: ProjectId.from(projectA),
      name: ProjectName.from('Alpha'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.from('desc'),
      goalId: null,
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(
        new Date('2025-01-01T00:00:00Z').getTime()
      ),
    });
    const createdB = new ProjectCreated({
      projectId: ProjectId.from(projectB),
      name: ProjectName.from('Beta'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-02-01'),
      description: ProjectDescription.from('desc'),
      goalId: null,
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(
        new Date('2025-01-01T00:00:00Z').getTime()
      ),
    });

    await eventStore.append(
      projectA,
      [await toEncrypted.toEncrypted(createdA, 1, kProjectA)]
    );
    await eventStore.append(
      projectB,
      [await toEncrypted.toEncrypted(createdB, 1, kProjectB)]
    );

    const first = new ProjectProjectionProcessor(
      store,
      eventStore,
      crypto,
      keyStore as unknown as IndexedDBKeyStore,
      toDomain
    );
    await first.start();
    expect(first.listProjects().map((p) => p.id).sort()).toEqual(
      [projectA, projectB].sort()
    );

    const second = new ProjectProjectionProcessor(
      store,
      eventStore,
      crypto,
      keyStore as unknown as IndexedDBKeyStore,
      toDomain
    );
    await second.start();
    expect(second.listProjects().map((p) => p.id).sort()).toEqual(
      [projectA, projectB].sort()
    );
  });
});
