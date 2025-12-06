import type { ProjectListItem } from './ProjectProjectionState';
import type { ProjectProjectionProcessor } from './projection/ProjectProjectionProcessor';

export class ProjectQueries {
  constructor(private readonly projection: ProjectProjectionProcessor) {}

  async listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): Promise<ProjectListItem[]> {
    await this.projection.whenReady();
    return this.projection.listProjects(filter);
  }

  async getProjectById(projectId: string): Promise<ProjectListItem | null> {
    await this.projection.whenReady();
    return this.projection.getProjectById(projectId);
  }

  async searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItem[]> {
    await this.projection.whenReady();
    return this.projection.searchProjects(term, filter);
  }
}
