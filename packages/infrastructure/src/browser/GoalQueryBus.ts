import type { GoalQueries } from './GoalQueries';
import type { GoalListItem } from './GoalProjectionState';
import { SimpleBus } from '@mo/application';

export type ListGoalsQuery = {
  type: 'ListGoals';
  filter?: { slice?: string; month?: string; priority?: string };
};
export type GetGoalByIdQuery = { type: 'GetGoalById'; goalId: string };
export type SearchGoalsQuery = {
  type: 'SearchGoals';
  term: string;
  filter?: { slice?: string; month?: string; priority?: string };
};

export type GoalQueryResult = GoalListItem[] | GoalListItem | null;

export type GoalQuery = ListGoalsQuery | GetGoalByIdQuery | SearchGoalsQuery;

export const registerGoalQueryHandlers = (
  bus: SimpleBus<GoalQuery, GoalQueryResult>,
  goalQueries: GoalQueries
): void => {
  bus.register('ListGoals', async (query: ListGoalsQuery) => {
    return goalQueries.listGoals(query.filter);
  });
  bus.register('GetGoalById', async (query: GetGoalByIdQuery) => {
    return goalQueries.getGoalById(query.goalId);
  });
  bus.register('SearchGoals', async (query: SearchGoalsQuery) => {
    return goalQueries.searchGoals(query.term, query.filter);
  });
};
