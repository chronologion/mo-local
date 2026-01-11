import { Project, ProjectId, Timestamp, UserId } from '@mo/domain';
import type { ProjectSnapshot } from '@mo/domain';
import {
  ConcurrencyError,
  EventStorePort,
  ProjectRepositoryPort,
  KeyStorePort,
  none,
  Option,
  some,
} from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { AggregateTypes, ZERO_EFFECTIVE_CURSOR } from '@mo/eventstore-core';
import { DomainToEncryptedEventAdapter } from '../eventstore/adapters/DomainToEncryptedEventAdapter';
import { EncryptedEventToDomainAdapter } from '../eventstore/adapters/EncryptedEventToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { KeyringManager } from '../crypto/KeyringManager';
import { PersistenceError } from '../errors';
import { decodeProjectSnapshotDomain, encodeProjectSnapshotPayload } from './snapshots/ProjectSnapshotCodec';
import { buildSnapshotAad } from '../eventing/aad';
import { SqliteSnapshotStore, type SnapshotStore } from '../eventstore/persistence/SnapshotStore';

/**
 * Browser-friendly project repository that uses encrypted event persistence.
 * Persists encrypted snapshots to speed reconstitution.
 */
export class ProjectRepository implements ProjectRepositoryPort {
  private readonly toEncrypted: DomainToEncryptedEventAdapter;
  private readonly toDomain: EncryptedEventToDomainAdapter;
  private readonly snapshotStore: SnapshotStore;

  constructor(
    private readonly eventStore: EventStorePort,
    private readonly db: SqliteDbPort,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort,
    private readonly keyringManager: KeyringManager,
    snapshotStore: SnapshotStore = new SqliteSnapshotStore()
  ) {
    this.toEncrypted = new DomainToEncryptedEventAdapter(crypto, 'project');
    this.toDomain = new EncryptedEventToDomainAdapter(crypto);
    this.snapshotStore = snapshotStore;
  }

  async load(id: ProjectId): Promise<Option<Project>> {
    const snapshotKey = await this.keyStore.getAggregateKey(id.value);
    const loadedSnapshot = snapshotKey ? await this.loadSnapshot(id.value, snapshotKey) : null;
    const tailEvents = loadedSnapshot
      ? await this.eventStore.getEvents(id.value, loadedSnapshot.snapshot.version + 1)
      : await this.eventStore.getEvents(id.value, 1);
    if (!loadedSnapshot && tailEvents.length === 0) return none();

    const domainTail = [];
    for (const event of tailEvents) {
      const key = await this.keyringManager.resolveKeyForEvent(event);
      domainTail.push(await this.toDomain.toDomain(event, key));
    }

    if (loadedSnapshot) {
      return some(Project.reconstituteFromSnapshot(loadedSnapshot.snapshot, domainTail));
    }
    return some(Project.reconstitute(id, domainTail));
  }

  async save(project: Project, encryptionKey: Uint8Array): Promise<void> {
    const pending = project.getUncommittedEvents();
    if (pending.length === 0) return;

    const snapshot = await this.loadSnapshot(project.id.value, encryptionKey);
    const eventVersionRows = await this.db.query<Readonly<{ version: number | null }>>(
      `
        SELECT MAX(version) as version
        FROM events
        WHERE aggregate_type = ? AND aggregate_id = ?
      `,
      [AggregateTypes.project, project.id.value]
    );
    const maxEventVersion = Number(eventVersionRows[0]?.version ?? 0);
    const baseVersion = Math.max(maxEventVersion, snapshot?.snapshot.version ?? 0);
    const startVersion = baseVersion + 1;
    try {
      const encrypted = [];
      for (let idx = 0; idx < pending.length; idx += 1) {
        const event = pending[idx];
        if (!event) continue;
        encrypted.push(await this.toEncrypted.toEncrypted(event, startVersion + idx, encryptionKey));
      }
      await this.eventStore.append(project.id.value, encrypted);
      await this.persistSnapshot(project, encryptionKey);
      project.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown persistence error';
      throw new PersistenceError(`Failed to save project ${project.id.value}: ${message}`);
    }
  }

  async archive(_id: ProjectId, _archivedAt: Timestamp, _actorId: UserId): Promise<void> {
    // Project archiving is event-driven; nothing to delete from the event log.
  }

  private async persistSnapshot(project: Project, encryptionKey: Uint8Array): Promise<void> {
    const snapshotVersion = project.version;
    const payload = {
      id: project.id.value,
      name: project.name.value,
      status: project.status.value,
      startDate: project.startDate.value,
      targetDate: project.targetDate.value,
      description: project.description.value,
      goalId: project.goalId ? project.goalId.value : null,
      milestones: project.milestones.map((m) => ({
        id: m.id.value,
        name: m.name.value,
        targetDate: m.targetDate.value,
      })),
      createdBy: project.createdBy.value,
      createdAt: project.createdAt.value,
      updatedAt: project.updatedAt.value,
      archivedAt: project.archivedAt ? project.archivedAt.value : null,
      version: snapshotVersion,
    };
    const aad = buildSnapshotAad(project.id.value, snapshotVersion);
    const cipher = await this.crypto.encrypt(encodeProjectSnapshotPayload(payload), encryptionKey, aad);
    await this.snapshotStore.put(
      this.db,
      { table: 'events', aggregateType: AggregateTypes.project },
      {
        aggregateId: project.id.value,
        snapshotVersion,
        snapshotEncrypted: cipher,
        lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
        writtenAt: project.updatedAt.value,
      }
    );
  }

  private async loadSnapshot(aggregateId: string, key: Uint8Array): Promise<{ snapshot: ProjectSnapshot } | null> {
    const record = await this.snapshotStore.get(
      this.db,
      { table: 'events', aggregateType: AggregateTypes.project },
      aggregateId
    );
    if (!record) return null;
    const aad = buildSnapshotAad(aggregateId, record.snapshotVersion);
    let plaintext: Uint8Array;
    try {
      plaintext = await this.crypto.decrypt(record.snapshotEncrypted, key, aad);
    } catch (error) {
      if (this.isCryptoOperationError(error)) {
        await this.purgeCorruptSnapshot(aggregateId);
        return null;
      }
      throw error;
    }
    try {
      return {
        snapshot: decodeProjectSnapshotDomain(plaintext, record.snapshotVersion),
      };
    } catch {
      await this.purgeCorruptSnapshot(aggregateId);
      return null;
    }
  }

  private isCryptoOperationError(error: unknown): boolean {
    return (
      (error instanceof DOMException && error.name === 'OperationError') ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'OperationError')
    );
  }

  private async purgeCorruptSnapshot(aggregateId: string): Promise<void> {
    console.warn('[ProjectRepository] Corrupt snapshot detected; removing', aggregateId);
    await this.db.execute('DELETE FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ?', [
      AggregateTypes.project,
      aggregateId,
    ]);
  }
}
