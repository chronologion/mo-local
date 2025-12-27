import { describe, expect, it } from 'vitest';
import { ProjectRepository } from '../../src/projects/ProjectRepository';
import { WebCryptoService } from '../../src/crypto/WebCryptoService';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import type { IEventStore, EncryptedEvent } from '@mo/application';
import { ProjectId, ProjectName } from '@mo/domain';
import type { Store } from '@livestore/livestore';
import { buildSnapshotAad } from '../../src/eventing/aad';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';

class SnapshotStoreStub {
  private readonly snapshots = new Map<
    string,
    { payload_encrypted: Uint8Array; version: number; last_sequence: number }
  >();
  readonly deleted: string[] = [];

  subscribe(): () => void {
    return () => {};
  }

  saveSnapshot(
    aggregateId: string,
    payloadEncrypted: Uint8Array,
    version: number,
    lastSequence: number = version
  ): void {
    this.snapshots.set(aggregateId, {
      payload_encrypted: payloadEncrypted,
      version,
      last_sequence: lastSequence,
    });
  }

  query<TResult>({
    query,
    bindValues,
  }: {
    query: string;
    bindValues: Array<string | number | Uint8Array>;
  }): TResult {
    if (
      query.includes(
        'SELECT payload_encrypted, version, last_sequence FROM project_snapshots'
      )
    ) {
      const aggregateId = bindValues[0] as string;
      const row = this.snapshots.get(aggregateId);
      return (row ? [row] : []) as unknown as TResult;
    }
    if (query.includes('DELETE FROM project_snapshots')) {
      const aggregateId = bindValues[0] as string;
      this.snapshots.delete(aggregateId);
      this.deleted.push(aggregateId);
      return [] as unknown as TResult;
    }
    // ProjectRepository.load only issues a SELECT against project_snapshots.
    return [] as unknown as TResult;
  }
}

class EmptyEventStoreStub implements IEventStore {
  async append(_aggregateId: string, _events: EncryptedEvent[]): Promise<void> {
    // no-op for this test
  }

  async getEvents(
    _aggregateId: string,
    _fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    return [];
  }

  async getAllEvents(): Promise<EncryptedEvent[]> {
    return [];
  }
}

describe('ProjectRepository snapshot compatibility', () => {
  it('purges snapshots without envelope/createdBy and returns none', async () => {
    const crypto = new WebCryptoService();
    const kProject = await crypto.generateKey();
    const storeStub = new SnapshotStoreStub();
    const store = storeStub as unknown as Store;
    const eventStore = new EmptyEventStoreStub();
    const keyStore = new InMemoryKeyStore();
    const keyringManager = new KeyringManager(
      crypto,
      keyStore,
      new InMemoryKeyringStore()
    );
    const aggregateId = '00000000-0000-0000-0000-000000000001';
    const projectId = ProjectId.from(aggregateId);

    const legacySnapshotPayload = {
      id: aggregateId,
      name: ProjectName.from('Legacy').value,
      status: 'planned' as const,
      startDate: '2025-01-01',
      targetDate: '2025-02-01',
      description: 'desc',
      goalId: null as string | null,
      milestones: [] as { id: string; name: string; targetDate: string }[],
      // NOTE: createdBy intentionally omitted to simulate legacy snapshots.
      createdAt: Date.UTC(2025, 0, 1),
      updatedAt: Date.UTC(2025, 0, 1),
      archivedAt: null as number | null,
    };

    const version = 1;
    const aad = buildSnapshotAad(aggregateId, version);
    const plaintext = new TextEncoder().encode(
      JSON.stringify(legacySnapshotPayload)
    );
    const cipher = await crypto.encrypt(plaintext, kProject, aad);

    storeStub.saveSnapshot(aggregateId, cipher, version);
    await keyStore.saveAggregateKey(aggregateId, kProject);

    const repo = new ProjectRepository(
      eventStore,
      store,
      crypto,
      keyStore,
      keyringManager
    );

    const loaded = await repo.load(projectId);

    expect(loaded.kind).toBe('none');
    expect(storeStub.deleted).toContain(aggregateId);
  });

  it('purges corrupt snapshots and returns null instead of throwing', async () => {
    const crypto = new WebCryptoService();
    const kProject = await crypto.generateKey();
    const storeStub = new SnapshotStoreStub();
    const store = storeStub as unknown as Store;
    const eventStore = new EmptyEventStoreStub();
    const keyStore = new InMemoryKeyStore();
    const keyringManager = new KeyringManager(
      crypto,
      keyStore,
      new InMemoryKeyringStore()
    );
    const aggregateId = '00000000-0000-0000-0000-000000000002';
    const projectId = ProjectId.from(aggregateId);

    // Save an intentionally corrupt payload that will fail decryption.
    const corruptCipher = new Uint8Array(64).fill(7);
    storeStub.saveSnapshot(aggregateId, corruptCipher, 1);
    await keyStore.saveAggregateKey(aggregateId, kProject);

    const repo = new ProjectRepository(
      eventStore,
      store,
      crypto,
      keyStore,
      keyringManager
    );

    const loaded = await repo.load(projectId);

    expect(loaded.kind).toBe('none');
    expect(storeStub.deleted).toContain(aggregateId);
  });
});
