import type { ReadModel } from '../../shared/ports/ReadModel';
import type { ProjectListItemDto } from '@mo/interface';

/**
 * Read-side ports for project projections.
 */
export type ProjectListFilter = {
  status?: string;
  goalId?: string | null;
};

export type IProjectReadModel = ReadModel<
  ProjectListItemDto,
  ProjectListFilter
>;
