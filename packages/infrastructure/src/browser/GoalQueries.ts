import type { GoalListItem } from './GoalProjectionState';
import type { GoalProjectionProcessor } from './projection/GoalProjectionProcessor';

/**
 * Goal queries backed by the in-memory projection maintained by GoalProjectionProcessor.
 */
export class GoalQueries {
  constructor(private readonly projection: GoalProjectionProcessor) {}

  async listGoals(): Promise<GoalListItem[]> {
    await this.projection.whenReady();
    return this.projection.listGoals();
  }

  async getGoalById(goalId: string): Promise<GoalListItem | null> {
    await this.projection.whenReady();
    return this.projection.getGoalById(goalId);
  }
}
