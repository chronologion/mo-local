import type { IQuery } from '../../shared/ports/cqrsTypes';
import type { GoalListFilter } from '../ports/IGoalReadModel';

export class SearchGoalsQuery implements IQuery<'SearchGoals'> {
  readonly type = 'SearchGoals' as const;

  constructor(
    public readonly term: string,
    public readonly filter?: GoalListFilter
  ) {}
}
