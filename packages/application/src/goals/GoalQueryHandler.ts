import type { IQueryHandler } from '../shared/ports/cqrsTypes';
import type { IGoalQueries } from './ports/IGoalQueries';
import type { GoalListItemDto } from '@mo/interface';
import { ListGoalsQuery, GetGoalByIdQuery, SearchGoalsQuery } from './queries';

export type GoalQuery = ListGoalsQuery | GetGoalByIdQuery | SearchGoalsQuery;

export type GoalQueryResult = GoalListItemDto[] | GoalListItemDto | null;

export class GoalQueryHandler implements IQueryHandler<
  GoalQuery,
  GoalQueryResult
> {
  constructor(private readonly queries: IGoalQueries) {}

  execute(query: GoalQuery): Promise<GoalQueryResult> {
    switch (query.type) {
      case 'ListGoals':
        return this.queries.listGoals(query.filter);
      case 'GetGoalById':
        return this.queries.getGoalById(query.goalId);
      case 'SearchGoals':
        return this.queries.searchGoals(query.term, query.filter);
      default: {
        const _exhaustive: never = query;
        return Promise.reject(
          new Error(`Unsupported goal query type: ${(query as GoalQuery).type}`)
        );
      }
    }
  }
}
