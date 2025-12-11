import type { IQuery } from '../../shared/ports/cqrsTypes';
import type { GoalListFilter } from '../ports/IGoalReadModel';

export class ListGoalsQuery implements IQuery<'ListGoals'> {
  readonly type = 'ListGoals' as const;

  constructor(public readonly filter?: GoalListFilter) {}
}
