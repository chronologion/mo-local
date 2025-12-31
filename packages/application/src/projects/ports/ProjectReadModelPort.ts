import type { ReadModel } from '../../shared/ports/ReadModel';
import type { ProjectListItemDto } from '../dtos';

/**
 * Read-side ports for project projections.
 */
export type ProjectListFilter = {
  status?: string;
  goalId?: string | null;
};

export type ProjectReadModelPort = ReadModel<
  ProjectListItemDto,
  ProjectListFilter
>;
