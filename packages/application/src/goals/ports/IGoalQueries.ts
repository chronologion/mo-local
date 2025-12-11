import type { GoalListItemDto } from '@mo/interface';

/**
 * Read-side ports for goal projections.
 */
export interface IGoalQueries {
  listGoals(filter?: {
    slice?: string;
    month?: string;
    priority?: string;
  }): Promise<GoalListItemDto[]>;

  getGoalById(goalId: string): Promise<GoalListItemDto | null>;

  searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): Promise<GoalListItemDto[]>;
}
