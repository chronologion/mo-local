import type { GoalQueries, GoalListItem } from '@mo/infrastructure/browser';
import { QueryBus } from './QueryBus';

type ListGoalsQuery = { type: 'ListGoals' };
type GetGoalByIdQuery = { type: 'GetGoalById'; goalId: string };

export type GoalQueryResult = GoalListItem[] | GoalListItem | null;

export const registerGoalQueryHandlers = (
  bus: QueryBus<GoalQueryResult>,
  goalQueries: GoalQueries
): void => {
  bus.register('ListGoals', async (_query: ListGoalsQuery) => {
    return goalQueries.listGoals();
  });
  bus.register('GetGoalById', async (query: GetGoalByIdQuery) => {
    return goalQueries.getGoalById(query.goalId);
  });
};
