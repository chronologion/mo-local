import type { IQueryHandler } from '../shared/ports/cqrsTypes';
import type { IGoalReadModel } from './ports/IGoalReadModel';
import type { GoalListItemDto } from './dtos';
import { ListGoalsQuery, GetGoalByIdQuery, SearchGoalsQuery } from './queries';

export type GoalQuery = ListGoalsQuery | GetGoalByIdQuery | SearchGoalsQuery;

export type GoalQueryResult = GoalListItemDto[] | GoalListItemDto | null;

export class GoalQueryHandler implements IQueryHandler<
  GoalQuery,
  GoalQueryResult
> {
  constructor(private readonly readModel: IGoalReadModel) {}

  execute(query: GoalQuery): Promise<GoalQueryResult> {
    switch (query.type) {
      case 'ListGoals':
        return this.readModel.list(query.filter);
      case 'GetGoalById':
        return this.readModel.getById(query.goalId);
      case 'SearchGoals':
        return this.readModel.search(query.term, query.filter);
      default: {
        const _exhaustive: never = query;
        return Promise.reject(
          new Error(`Unsupported goal query type: ${(query as GoalQuery).type}`)
        );
      }
    }
  }
}
