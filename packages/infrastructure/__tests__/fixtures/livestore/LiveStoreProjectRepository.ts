import { Project, ProjectId, DomainEvent, Timestamp } from '@mo/domain';
import {
  ConcurrencyError,
  EncryptedEvent,
  IEventStore,
  NotFoundError,
  IProjectRepository,
} from '@mo/application';
import { PersistenceError } from '../../../src/errors';

export interface ProjectEventAdapter {
  toEncrypted(
    event: DomainEvent,
    version: number,
    encryptionKey: Uint8Array
  ): EncryptedEvent;
  toDomain(event: EncryptedEvent, encryptionKey: Uint8Array): DomainEvent;
}

/**
 * Event-sourced project repository backed by an IEventStore (e.g., LiveStoreEventStore).
 */
export class LiveStoreProjectRepository implements IProjectRepository {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly adapter: ProjectEventAdapter,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {}

  async load(id: ProjectId): Promise<Project | null> {
    const encryptedEvents = await this.eventStore.getEvents(id.value);
    if (encryptedEvents.length === 0) return null;

    const kProject = await this.keyProvider(id.value);
    if (!kProject) {
      throw new NotFoundError(
        `Encryption key for aggregate ${id.value} not found`
      );
    }

    const domainEvents = encryptedEvents.map((e) =>
      this.adapter.toDomain(e, kProject)
    );
    return Project.reconstitute(id, domainEvents);
  }

  async save(project: Project, encryptionKey: Uint8Array): Promise<void> {
    const pending = project.getUncommittedEvents();
    if (pending.length === 0) return;

    const existing = await this.eventStore.getEvents(project.id.value);
    const startVersion = existing.length + 1;
    try {
      const encryptedBatch = pending.map((event, idx) =>
        this.adapter.toEncrypted(event, startVersion + idx, encryptionKey)
      );
      await this.eventStore.append(project.id.value, encryptedBatch);
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

  async archive(_id: ProjectId, _archivedAt: Timestamp): Promise<void> {
    // Soft-delete is modeled as events; no physical deletion.
  }
}
