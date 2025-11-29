import { Goal, GoalId } from '@mo/domain';
import { EncryptedEvent, IEventStore } from '@mo/application';
import { ConcurrencyError, NotFoundError } from '@mo/application';

export interface EventAdapter {
  toEncrypted(event: any, version: number): EncryptedEvent;
  toDomain(event: EncryptedEvent): any;
}

/**
 * Event-sourced goal repository backed by LiveStoreEventStore.
 *
 * Relies on an adapter to handle encryption/serialization.
 */
export class LiveStoreGoalRepository {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly adapter: EventAdapter
  ) {}

  async findById(id: GoalId): Promise<Goal | null> {
    const encryptedEvents = await this.eventStore.getEvents(id.value);
    if (encryptedEvents.length === 0) return null;

    const domainEvents = encryptedEvents.map((e) => this.adapter.toDomain(e));
    const goal = new (Goal as any)(id) as Goal;
    goal.loadFromHistory(domainEvents);
    goal.markEventsAsCommitted();
    return goal;
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    // encryptionKey included for parity with interface; adapter may use it in future extension
    const pending = goal.getUncommittedEvents();
    if (pending.length === 0) return;

    const existing = await this.eventStore.getEvents(goal.id.value);
    const startVersion = existing.length + 1;
    const encryptedBatch = pending.map((event, idx) =>
      this.adapter.toEncrypted(event, startVersion + idx)
    );

    try {
      await this.eventStore.append(goal.id.value, encryptedBatch);
      goal.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown persistence error';
      throw new Error(message);
    }
  }
}
