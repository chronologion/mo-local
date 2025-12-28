import {
  Project,
  ProjectId,
  Timestamp,
  UserId,
  projectEventTypes,
} from '@mo/domain';
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
import type { Store } from '@livestore/livestore';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { KeyringManager } from '../crypto/KeyringManager';
import { PersistenceError } from '../errors';
import {
  decodeProjectSnapshotDomain,
  encodeProjectSnapshotPayload,
} from './snapshots/ProjectSnapshotCodec';
import { buildSnapshotAad } from '../eventing/aad';

type SnapshotRow = {
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
};

/**
 * Browser-friendly project repository that uses LiveStore tables with encryption.
 * Browser-friendly project repository that uses LiveStore tables with encryption.
 * Persists encrypted snapshots to speed reconstitution.
 */
export class ProjectRepository implements ProjectRepositoryPort {
  private readonly toEncrypted: DomainToLiveStoreAdapter;
  private readonly toDomain: LiveStoreToDomainAdapter;

  constructor(
    private readonly eventStore: EventStorePort,
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort,
    private readonly keyringManager: KeyringManager
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async load(id: ProjectId): Promise<Option<Project>> {
    const snapshotKey = await this.keyStore.getAggregateKey(id.value);
    const loadedSnapshot = snapshotKey
      ? await this.loadSnapshot(id.value, snapshotKey)
      : null;
    const tailEvents = loadedSnapshot
      ? await this.eventStore.getAllEvents({
          aggregateId: id.value,
          since: loadedSnapshot.lastSequence,
        })
      : await this.eventStore.getAllEvents({ aggregateId: id.value });
    if (!loadedSnapshot && tailEvents.length === 0) return none();

    const domainTail = [];
    for (const event of tailEvents) {
      const key = await this.keyringManager.resolveKeyForEvent(event);
      domainTail.push(await this.toDomain.toDomain(event, key));
    }

    if (loadedSnapshot) {
      return some(
        Project.reconstituteFromSnapshot(loadedSnapshot.snapshot, domainTail)
      );
    }
    return some(Project.reconstitute(id, domainTail));
  }

  async save(project: Project, encryptionKey: Uint8Array): Promise<void> {
    const pending = project.getUncommittedEvents();
    if (pending.length === 0) return;

    const snapshot = await this.loadSnapshot(project.id.value, encryptionKey);
    const eventVersionRows = this.store.query<{ version: number | null }[]>({
      query:
        'SELECT MAX(version) as version FROM project_events WHERE aggregate_id = ?',
      bindValues: [project.id.value],
    });
    const maxEventVersion = Number(eventVersionRows[0]?.version ?? 0);
    const baseVersion = Math.max(
      maxEventVersion,
      snapshot?.snapshot.version ?? 0
    );
    const startVersion = baseVersion + 1;
    try {
      const encrypted = [];
      for (let idx = 0; idx < pending.length; idx += 1) {
        const event = pending[idx];
        if (!event) continue;
        const options = await this.buildEncryptionOptions(
          event.eventType,
          event.aggregateId.value,
          event.occurredAt.value,
          encryptionKey
        );
        encrypted.push(
          await this.toEncrypted.toEncrypted(
            event,
            startVersion + idx,
            encryptionKey,
            options
          )
        );
      }
      await this.eventStore.append(project.id.value, encrypted);
      await this.persistSnapshot(project, encryptionKey);
      project.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown persistence error';
      throw new PersistenceError(
        `Failed to save project ${project.id.value}: ${message}`
      );
    }
  }

  async archive(
    _id: ProjectId,
    _archivedAt: Timestamp,
    _actorId: UserId
  ): Promise<void> {
    // Project archiving is event-driven; nothing to delete from the event log.
  }

  private async buildEncryptionOptions(
    eventType: string,
    aggregateId: string,
    occurredAt: number,
    encryptionKey: Uint8Array
  ): Promise<{ epoch?: number; keyringUpdate?: Uint8Array } | undefined> {
    let keyringUpdate: Uint8Array | undefined;
    if (eventType === projectEventTypes.projectCreated) {
      const update = await this.keyringManager.createInitialUpdate(
        aggregateId,
        encryptionKey,
        occurredAt
      );
      keyringUpdate = update?.keyringUpdate;
    }
    const currentEpoch = await this.keyringManager.getCurrentEpoch(aggregateId);
    const epoch = currentEpoch !== 0 ? currentEpoch : undefined;
    if (!keyringUpdate && epoch === undefined) {
      return undefined;
    }
    return { epoch, keyringUpdate };
  }

  private async persistSnapshot(
    project: Project,
    encryptionKey: Uint8Array
  ): Promise<void> {
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
    const cipher = await this.crypto.encrypt(
      encodeProjectSnapshotPayload(payload),
      encryptionKey,
      aad
    );
    const storedCipherBuffer = new ArrayBuffer(cipher.byteLength);
    const storedCipher = new Uint8Array(storedCipherBuffer);
    storedCipher.set(cipher);
    const maxSequenceRows = this.store.query<{ sequence: number | null }[]>({
      query:
        'SELECT MAX(sequence) as sequence FROM project_events WHERE aggregate_id = ?',
      bindValues: [project.id.value],
    });
    const lastSequence = Number(maxSequenceRows[0]?.sequence ?? 0);
    this.store.query({
      query: `
        INSERT INTO project_snapshots (aggregate_id, payload_encrypted, version, last_sequence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(aggregate_id) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          version = excluded.version,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        project.id.value,
        storedCipher,
        snapshotVersion,
        lastSequence,
        project.updatedAt.value,
      ],
    });
  }

  private async loadSnapshot(
    aggregateId: string,
    key: Uint8Array
  ): Promise<{
    snapshot: ProjectSnapshot;
    lastSequence: number;
  } | null> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT payload_encrypted, version, last_sequence FROM project_snapshots WHERE aggregate_id = ? LIMIT 1',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    const row = rows[0];
    const aad = buildSnapshotAad(aggregateId, row.version);
    let plaintext: Uint8Array;
    try {
      plaintext = await this.crypto.decrypt(row.payload_encrypted, key, aad);
    } catch (error) {
      if (this.isCryptoOperationError(error)) {
        this.purgeCorruptSnapshot(aggregateId);
        return null;
      }
      throw error;
    }
    try {
      return {
        snapshot: decodeProjectSnapshotDomain(plaintext, row.version),
        lastSequence: Number(row.last_sequence),
      };
    } catch {
      this.purgeCorruptSnapshot(aggregateId);
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

  private purgeCorruptSnapshot(aggregateId: string): void {
    console.warn(
      '[ProjectRepository] Corrupt snapshot detected; removing',
      aggregateId
    );
    this.store.query({
      query: 'DELETE FROM project_snapshots WHERE aggregate_id = ?',
      bindValues: [aggregateId],
    });
  }
}
