import type { IQuery } from '../../shared/ports/cqrsTypes';
import type { GoalListFilter } from '../ports/GoalReadModelPort';

export class SearchGoalsQuery implements IQuery<'SearchGoals'> {
  readonly type = 'SearchGoals' as const;

  constructor(
    public readonly term: string,
    public readonly filter?: GoalListFilter
  ) {}
}
