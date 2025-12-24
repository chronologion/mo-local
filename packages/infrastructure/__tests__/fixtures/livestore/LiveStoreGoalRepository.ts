import { Goal, GoalId, DomainEvent } from '@mo/domain';
import {
  ConcurrencyError,
  EncryptedEvent,
  IEventStore,
  NotFoundError,
  none,
  Option,
  some,
} from '@mo/application';
import { PersistenceError } from '../../../src/errors';

export interface GoalEventAdapter {
  toEncrypted(
    event: DomainEvent,
    version: number,
    encryptionKey: Uint8Array
  ): EncryptedEvent;
  toDomain(event: EncryptedEvent, encryptionKey: Uint8Array): DomainEvent;
}

/**
 * Event-sourced goal repository backed by LiveStoreEventStore.
 *
 * Relies on an adapter to handle encryption/serialization.
 */
export class LiveStoreGoalRepository {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly adapter: GoalEventAdapter,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {}

  async load(id: GoalId): Promise<Option<Goal>> {
    const encryptedEvents = await this.eventStore.getEvents(id.value);
    if (encryptedEvents.length === 0) return none();

    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new NotFoundError(
        `Encryption key for aggregate ${id.value} not found`
      );
    }

    const domainEvents = encryptedEvents.map((e) =>
      this.adapter.toDomain(e, kGoal)
    );
    return some(Goal.reconstitute(id, domainEvents));
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
      const message =
        error instanceof Error ? error.message : 'Unknown persistence error';
      throw new PersistenceError(
        `Failed to save goal ${goal.id.value}: ${message}`
      );
    }
  }
}
