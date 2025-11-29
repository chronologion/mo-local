import { Goal, GoalId } from '@mo/domain';
import { ApplicationError, EncryptedEvent, IEventStore } from '@mo/application';
import { LiveStoreToDomainAdapter } from '@mo/infrastructure/browser';

export type GoalListItem = {
  id: string;
  summary: string;
  slice: string;
  priority: string;
  targetMonth: string;
  createdAt: number;
};

/**
 * Query helper that rebuilds goal projections from the persisted event log.
 * Uses the LiveStoreToDomainAdapter to decrypt and rehydrate aggregates.
 */
export class GoalQueries {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly toDomain: LiveStoreToDomainAdapter,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {}

  async listGoals(): Promise<GoalListItem[]> {
    const events = await this.eventStore.getAllEvents();
    const grouped = this.groupByAggregate(events);
    const results: GoalListItem[] = [];

    for (const [aggregateId, aggregateEvents] of grouped.entries()) {
      const kGoal = await this.keyProvider(aggregateId);
      if (!kGoal) {
        throw new ApplicationError(
          `Missing encryption key for ${aggregateId}`,
          'missing_key'
        );
      }

      const domainEvents = await this.toDomain.toDomainBatch(
        aggregateEvents,
        kGoal
      );
      const goal = Goal.reconstitute(GoalId.of(aggregateId), domainEvents);
      if (goal.isDeleted) continue;
      results.push({
        id: goal.id.value,
        summary: goal.summary.value,
        slice: goal.slice.value,
        priority: goal.priority.level,
        targetMonth: goal.targetMonth.value,
        createdAt: goal.createdAt.value.getTime(),
      });
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  private groupByAggregate(
    events: EncryptedEvent[]
  ): Map<string, EncryptedEvent[]> {
    return events.reduce<Map<string, EncryptedEvent[]>>((acc, event) => {
      const list = acc.get(event.aggregateId) ?? [];
      list.push(event);
      acc.set(event.aggregateId, list);
      return acc;
    }, new Map());
  }
}
