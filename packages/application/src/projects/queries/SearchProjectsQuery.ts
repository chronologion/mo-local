import type { IQuery } from '../../shared/ports/cqrsTypes';

export class SearchProjectsQuery implements IQuery<'SearchProjects'> {
  readonly type = 'SearchProjects' as const;

  constructor(
    public readonly term: string,
    public readonly filter?: { status?: string; goalId?: string | null }
  ) {}
}
