import { Goal, GoalId } from '@mo/domain';
import { ApplicationError, ConcurrencyError, EncryptedEvent, IEventStore, NotFoundError } from '@mo/application';

export interface EventAdapter {
  toEncrypted(event: any, version: number, encryptionKey: Uint8Array): EncryptedEvent;
  toDomain(event: EncryptedEvent, encryptionKey: Uint8Array): any;
}

/**
 * Event-sourced goal repository backed by LiveStoreEventStore.
 *
 * Relies on an adapter to handle encryption/serialization.
 */
export class LiveStoreGoalRepository {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly adapter: EventAdapter,
    private readonly keyProvider: (aggregateId: string) => Promise<Uint8Array | null>
  ) {}

  async findById(id: GoalId): Promise<Goal | null> {
    const encryptedEvents = await this.eventStore.getEvents(id.value);
    if (encryptedEvents.length === 0) return null;

    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new NotFoundError(`Encryption key for aggregate ${id.value} not found`);
    }

    const domainEvents = encryptedEvents.map((e) => this.adapter.toDomain(e, kGoal));
    return Goal.reconstitute(id, domainEvents);
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    const pending = goal.getUncommittedEvents();
    if (pending.length === 0) return;

    const existing = await this.eventStore.getEvents(goal.id.value);
    const startVersion = existing.length + 1;
    try {
      const encryptedBatch = pending.map((event, idx) =>
        this.adapter.toEncrypted(event, startVersion + idx, encryptionKey)
      );
      await this.eventStore.append(goal.id.value, encryptedBatch);
      goal.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown persistence error';
      throw new ApplicationError(`Failed to save goal ${goal.id.value}: ${message}`, 'event_store_save_failed');
    }
  }
}
