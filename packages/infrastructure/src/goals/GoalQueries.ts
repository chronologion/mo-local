import type { GoalProjectionProcessor } from './projection/GoalProjectionProcessor';
import type { IGoalQueries } from '@mo/application';
import type { GoalListItemDto } from '@mo/interface';

/**
 * Goal queries backed by the in-memory projection maintained by GoalProjectionProcessor.
 */
export class GoalQueries implements IGoalQueries {
  constructor(private readonly projection: GoalProjectionProcessor) {}

  async listGoals(filter?: {
    slice?: string;
    month?: string;
    priority?: string;
  }): Promise<GoalListItemDto[]> {
    await this.projection.whenReady();
    const all = this.projection.listGoals();
    if (!filter) return all;
    return all.filter((item) => {
      if (filter.slice && item.slice !== filter.slice) return false;
      if (filter.month && item.targetMonth !== filter.month) return false;
      if (filter.priority && item.priority !== filter.priority) return false;
      return true;
    });
  }

  async getGoalById(goalId: string): Promise<GoalListItemDto | null> {
    await this.projection.whenReady();
    return this.projection.getGoalById(goalId);
  }

  async searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): Promise<GoalListItemDto[]> {
    await this.projection.whenReady();
    return this.projection.searchGoals(term, filter);
  }
}
