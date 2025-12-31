import type { IQuery } from '../../shared/ports/cqrsTypes';
import type { ProjectListFilter } from '../ports/ProjectReadModelPort';

export class SearchProjectsQuery implements IQuery<'SearchProjects'> {
  readonly type = 'SearchProjects' as const;

  constructor(
    public readonly term: string,
    public readonly filter?: ProjectListFilter
  ) {}
}
