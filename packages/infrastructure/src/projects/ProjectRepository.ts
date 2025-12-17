import {
  Project,
  ProjectId,
  ProjectName,
  ProjectStatus,
  ProjectDescription,
  LocalDate,
  GoalId,
  Milestone,
  MilestoneId,
  UserId,
  Timestamp,
} from '@mo/domain';
import {
  ConcurrencyError,
  IEventStore,
  IProjectRepository,
} from '@mo/application';
import type { Store } from '@livestore/livestore';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { MissingKeyError, PersistenceError } from '../errors';

type SnapshotRow = {
  payload_encrypted: Uint8Array;
  version: number;
};

/**
 * Browser-friendly project repository that uses LiveStore tables with encryption.
 * Browser-friendly project repository that uses LiveStore tables with encryption.
 * Persists encrypted snapshots to speed reconstitution.
 */
export class ProjectRepository implements IProjectRepository {
  private readonly toEncrypted: DomainToLiveStoreAdapter;
  private readonly toDomain: LiveStoreToDomainAdapter;

  constructor(
    private readonly eventStore: IEventStore,
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async load(id: ProjectId): Promise<Project | null> {
    const kProject = await this.keyProvider(id.value);
    if (!kProject) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }

    const snapshot = await this.loadSnapshot(id.value, kProject);
    const fromVersion = snapshot ? snapshot.version + 1 : 1;
    const tailEvents = await this.eventStore.getEvents(id.value, fromVersion);
    if (!snapshot && tailEvents.length === 0) return null;

    const domainTail = await Promise.all(
      tailEvents.map((event) => this.toDomain.toDomain(event, kProject))
    );

    if (snapshot) {
      return Project.reconstituteFromSnapshot(snapshot, domainTail);
    }
    return Project.reconstitute(id, domainTail);
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
    const baseVersion = Math.max(maxEventVersion, snapshot?.version ?? 0);
    const startVersion = baseVersion + 1;
    try {
      const encrypted = await Promise.all(
        pending.map((event, idx) =>
          this.toEncrypted.toEncrypted(
            event as never,
            startVersion + idx,
            encryptionKey
          )
        )
      );
      await this.eventStore.append(project.id.value, encrypted);
      await this.persistSnapshot(project, encryptionKey, startVersion, pending);
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

  async archive(_id: ProjectId): Promise<void> {
    // Project archiving is event-driven; nothing to delete from the event log.
  }

  private async persistSnapshot(
    project: Project,
    encryptionKey: Uint8Array,
    startVersion: number,
    pending: readonly unknown[]
  ): Promise<void> {
    const nextVersion = startVersion + pending.length - 1;
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
        name: m.name,
        targetDate: m.targetDate.value,
      })),
      createdBy: project.createdBy.value,
      createdAt: project.createdAt.value,
      updatedAt: project.updatedAt.value,
      archivedAt: project.archivedAt ? project.archivedAt.value : null,
      version: nextVersion,
    };
    const aad = new TextEncoder().encode(
      `${project.id.value}:snapshot:${nextVersion}`
    );
    const cipher = await this.crypto.encrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
      encryptionKey,
      aad
    );
    const storedCipherBuffer = new ArrayBuffer(cipher.byteLength);
    const storedCipher = new Uint8Array(storedCipherBuffer);
    storedCipher.set(cipher);
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
        nextVersion,
        nextVersion,
        project.updatedAt.value,
      ],
    });
  }

  private async loadSnapshot(
    aggregateId: string,
    key: Uint8Array
  ): Promise<{
    id: ProjectId;
    name: ProjectName;
    status: ProjectStatus;
    startDate: LocalDate;
    targetDate: LocalDate;
    description: ProjectDescription;
    goalId: GoalId | null;
    milestones: Milestone[];
    createdBy: UserId;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    archivedAt: Timestamp | null;
    version: number;
  } | null> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT payload_encrypted, version FROM project_snapshots WHERE aggregate_id = ? LIMIT 1',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    const row = rows[0];
    type SnapshotPayload = {
      id: string;
      name: string;
      status: 'planned' | 'in_progress' | 'completed' | 'canceled';
      startDate: string;
      targetDate: string;
      description: string;
      goalId: string | null;
      milestones?: { id: string; name: string; targetDate: string }[];
      createdBy?: string;
      createdAt: number;
      updatedAt: number;
      archivedAt: number | null;
    };
    const aad = new TextEncoder().encode(
      `${aggregateId}:snapshot:${row.version}`
    );
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
    let parsed: SnapshotPayload;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      this.purgeCorruptSnapshot(aggregateId);
      return null;
    }
    const createdByRaw =
      typeof parsed.createdBy === 'string' && parsed.createdBy.trim().length > 0
        ? parsed.createdBy
        : 'imported';
    return {
      id: ProjectId.from(parsed.id),
      name: ProjectName.from(parsed.name),
      status: ProjectStatus.from(parsed.status),
      startDate: LocalDate.fromString(parsed.startDate),
      targetDate: LocalDate.fromString(parsed.targetDate),
      description: ProjectDescription.from(parsed.description),
      goalId: parsed.goalId ? GoalId.from(parsed.goalId) : null,
      milestones: (parsed.milestones ?? []).map((m) =>
        Milestone.create({
          id: MilestoneId.from(m.id),
          name: m.name,
          targetDate: LocalDate.fromString(m.targetDate),
        })
      ),
      createdBy: UserId.from(createdByRaw),
      createdAt: Timestamp.fromMillis(parsed.createdAt),
      updatedAt: Timestamp.fromMillis(parsed.updatedAt),
      archivedAt:
        parsed.archivedAt === null
          ? null
          : Timestamp.fromMillis(parsed.archivedAt),
      version: row.version,
    };
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
