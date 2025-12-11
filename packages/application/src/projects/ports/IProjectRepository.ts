import { Project, ProjectId } from '@mo/domain';
import type { Repository } from '../../shared/ports/Repository';

/**
 * Persistence boundary for Project aggregates.
 */
export interface IProjectRepository extends Repository<Project, ProjectId> {
  archive(id: ProjectId): Promise<void>;
}
