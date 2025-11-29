import { GoalId } from '@mo/domain';
import { IEventStore } from '@mo/application';
import { GoalRepository } from './GoalRepository';

export type GoalListItem = {
  id: string;
  summary: string;
  slice: string;
  priority: string;
  targetMonth: string;
};

/**
 * Lightweight query helper: reconstructs goals from the event log.
 * Uses the LiveStoreGoalRepository to rehydrate per aggregate.
 */
export class GoalQueries {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly repository: GoalRepository
  ) {}

  async listGoals(): Promise<GoalListItem[]> {
    const events = await this.eventStore.getAllEvents();
    const aggregateIds = Array.from(
      new Set(events.map((event) => event.aggregateId))
    );

    const results = await Promise.all(
      aggregateIds.map(async (id) => {
        const goal = await this.repository.findById(GoalId.of(id));
        if (!goal || goal.isDeleted) return null;
        return {
          id: goal.id.value,
          summary: goal.summary.value,
          slice: goal.slice.value,
          priority: goal.priority.level,
          targetMonth: goal.targetMonth.value,
        };
      })
    );

    return results.filter(Boolean) as GoalListItem[];
  }
}
