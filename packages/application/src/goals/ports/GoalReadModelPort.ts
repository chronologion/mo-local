import type { ReadModel } from '../../shared/ports/ReadModel';
import type { GoalListItemDto } from '../dtos';

/**
 * Read-side port for goal projections.
 */
export type GoalListFilter = {
  slice?: string;
  month?: string;
  priority?: string;
};

export type GoalReadModelPort = ReadModel<GoalListItemDto, GoalListFilter>;
