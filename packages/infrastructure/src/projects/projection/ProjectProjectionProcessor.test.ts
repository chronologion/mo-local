import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectProjectionProcessor } from './ProjectProjectionProcessor';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import { DomainToLiveStoreAdapter } from '../../livestore/adapters/DomainToLiveStoreAdapter';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import type { IndexedDBKeyStore } from '../../crypto/IndexedDBKeyStore';
import {
  ProjectCreated,
  ProjectStatusChanged,
  ProjectArchived,
  ProjectStatus,
  DomainEvent,
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
  const projectId = 'project-1';

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
      projectId,
      name: 'Alpha',
      status: 'planned',
      startDate: '2025-01-01',
      targetDate: '2025-02-01',
      description: 'desc',
      goalId: null,
      createdBy: 'user-1',
      createdAt: new Date(),
    });
    const status = new ProjectStatusChanged({
      projectId,
      status: 'in_progress' as ProjectStatus['value'],
      changedAt: new Date(),
    });
    const archived = new ProjectArchived({
      projectId,
      deletedAt: new Date(),
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
      projectId,
      name: 'Build UI',
      status: 'planned',
      startDate: '2025-03-01',
      targetDate: '2025-04-01',
      description: 'Ship MVP',
      goalId: null,
      createdBy: 'user-1',
      createdAt: new Date(),
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
});
