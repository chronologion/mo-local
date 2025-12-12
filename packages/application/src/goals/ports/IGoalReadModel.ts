import type { ReadModel } from '../../shared/ports/ReadModel';
import type { GoalListItemDto } from '@mo/presentation';

/**
 * Read-side port for goal projections.
 */
export type GoalListFilter = {
  slice?: string;
  month?: string;
  priority?: string;
};

export type IGoalReadModel = ReadModel<GoalListItemDto, GoalListFilter>;
