import type { ProjectProjectionProcessor } from './projection/ProjectProjectionProcessor';
import type { IProjectQueries } from '@mo/application';
import type { ProjectListItemDto } from '@mo/interface';

export class ProjectQueries implements IProjectQueries {
  constructor(private readonly projection: ProjectProjectionProcessor) {}

  async listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    return this.projection.listProjects(filter);
  }

  async getProjectById(projectId: string): Promise<ProjectListItemDto | null> {
    await this.projection.whenReady();
    return this.projection.getProjectById(projectId);
  }

  async searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    return this.projection.searchProjects(term, filter);
  }
}
