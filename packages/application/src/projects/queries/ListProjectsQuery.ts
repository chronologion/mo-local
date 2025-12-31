import type { IQuery } from '../../shared/ports/cqrsTypes';
import type { ProjectListFilter } from '../ports/ProjectReadModelPort';

export class ListProjectsQuery implements IQuery<'ListProjects'> {
  readonly type = 'ListProjects' as const;

  constructor(public readonly filter?: ProjectListFilter) {}
}
