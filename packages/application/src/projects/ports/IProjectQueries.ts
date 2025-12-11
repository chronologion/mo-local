import type { ProjectListItemDto } from '@mo/interface';

/**
 * Read-side ports for project projections.
 */
export interface IProjectQueries {
  listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): Promise<ProjectListItemDto[]>;

  getProjectById(projectId: string): Promise<ProjectListItemDto | null>;

  searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItemDto[]>;
}
