import { Project, ProjectId } from '@mo/domain';

/**
 * Persistence boundary for Project aggregates.
 */
export interface IProjectRepository {
  findById(id: ProjectId): Promise<Project | null>;

  save(project: Project, encryptionKey: Uint8Array): Promise<void>;

  archive(id: ProjectId): Promise<void>;
}
