import type { IProjectReadModel, ProjectListFilter } from '@mo/application';
import type { ProjectListItemDto } from '@mo/interface';
import type { ProjectProjectionProcessor } from './projection/ProjectProjectionProcessor';

/**
 * Adapter that exposes ProjectProjectionProcessor caches via the application read model port.
 */
export class ProjectReadModel implements IProjectReadModel {
  constructor(private readonly projection: ProjectProjectionProcessor) {}

  async list(filter?: ProjectListFilter): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    return this.projection.listProjects(filter);
  }

  async getById(projectId: string): Promise<ProjectListItemDto | null> {
    await this.projection.whenReady();
    return this.projection.getProjectById(projectId);
  }

  async search(
    term: string,
    filter?: ProjectListFilter
  ): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    return this.projection.searchProjects(term, filter);
  }
}
