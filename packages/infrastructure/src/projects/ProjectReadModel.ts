import type { ProjectReadModelPort, ProjectListFilter } from '@mo/application';
import type { ProjectListItemDto } from '@mo/application';
import type { ProjectProjectionProcessor } from './derived-state/ProjectProjectionProcessor';

/**
 * Adapter that exposes ProjectProjectionProcessor caches via the application read model port.
 */
export class ProjectReadModel implements ProjectReadModelPort {
  constructor(private readonly projection: ProjectProjectionProcessor) {}

  async list(filter?: ProjectListFilter): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    await this.projection.flush();
    return this.projection.listProjects(filter);
  }

  async getById(projectId: string): Promise<ProjectListItemDto | null> {
    await this.projection.whenReady();
    await this.projection.flush();
    return this.projection.getProjectById(projectId);
  }

  async search(term: string, filter?: ProjectListFilter): Promise<ProjectListItemDto[]> {
    await this.projection.whenReady();
    await this.projection.flush();
    return this.projection.searchProjects(term, filter);
  }
}
