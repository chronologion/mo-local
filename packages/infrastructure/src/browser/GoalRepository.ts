import { Goal, GoalId } from '@mo/domain';
import {
  ConcurrencyError,
  IEventStore,
  IGoalRepository,
} from '@mo/application';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { MissingKeyError, PersistenceError } from '../errors';

/**
 * Browser-friendly goal repository that uses async adapters with encryption.
 */
export class GoalRepository implements IGoalRepository {
  private readonly toEncrypted: DomainToLiveStoreAdapter;
  private readonly toDomain: LiveStoreToDomainAdapter;

  constructor(
    private readonly eventStore: IEventStore,
    crypto: WebCryptoService,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async findById(id: GoalId): Promise<Goal | null> {
    const events = await this.eventStore.getEvents(id.value);
    if (events.length === 0) return null;

    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }

    const domainEvents = await Promise.all(
      events.map((event) => this.toDomain.toDomain(event, kGoal))
    );

    return Goal.reconstitute(id, domainEvents);
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    const pending = goal.getUncommittedEvents();
    if (pending.length === 0) return;

    const existing = await this.eventStore.getEvents(goal.id.value);
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
      await this.eventStore.append(goal.id.value, encrypted);
      goal.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown persistence error';
      throw new PersistenceError(
        `Failed to save goal ${goal.id.value}: ${message}`
      );
    }
  }

  async delete(id: GoalId): Promise<void> {
    const goal = await this.findById(id);
    if (!goal) return;
    goal.delete();
    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }
    await this.save(goal, kGoal);
  }
}
