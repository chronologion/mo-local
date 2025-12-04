import type { GoalQueries } from './GoalQueries';
import type { GoalListItem } from './GoalProjectionState';
import { SimpleBus } from '@mo/application';

type ListGoalsQuery = { type: 'ListGoals' };
type GetGoalByIdQuery = { type: 'GetGoalById'; goalId: string };

export type GoalQueryResult = GoalListItem[] | GoalListItem | null;

export const registerGoalQueryHandlers = (
  bus: SimpleBus<{ type: string; goalId?: string }, GoalQueryResult>,
  goalQueries: GoalQueries
): void => {
  bus.register('ListGoals', async (_query: ListGoalsQuery) => {
    return goalQueries.listGoals();
  });
  bus.register('GetGoalById', async (query: GetGoalByIdQuery) => {
    return goalQueries.getGoalById(query.goalId);
  });
};
