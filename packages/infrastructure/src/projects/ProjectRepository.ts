import { Project, ProjectId } from '@mo/domain';
import {
  ConcurrencyError,
  IEventStore,
  IProjectRepository,
} from '@mo/application';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { MissingKeyError, PersistenceError } from '../errors';

/**
 * Browser-friendly project repository that uses LiveStore tables with encryption.
 * Snapshots are not yet persisted; reconstruction uses the full event stream.
 */
export class ProjectRepository implements IProjectRepository {
  private readonly toEncrypted: DomainToLiveStoreAdapter;
  private readonly toDomain: LiveStoreToDomainAdapter;

  constructor(
    private readonly eventStore: IEventStore,
    private readonly crypto: WebCryptoService,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async findById(id: ProjectId): Promise<Project | null> {
    const encryptedEvents = await this.eventStore.getEvents(id.value);
    if (encryptedEvents.length === 0) return null;

    const kProject = await this.keyProvider(id.value);
    if (!kProject) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }

    const domainEvents = await this.toDomain.toDomainBatch(
      encryptedEvents,
      kProject
    );
    return Project.reconstitute(id, domainEvents);
  }

  async save(project: Project, encryptionKey: Uint8Array): Promise<void> {
    const pending = project.getUncommittedEvents();
    if (pending.length === 0) return;

    const existing = await this.eventStore.getEvents(project.id.value);
    const startVersion = existing.length + 1;
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

  async delete(_id: ProjectId): Promise<void> {
    // Project archiving is event-driven; nothing to delete from the event log.
  }
}
