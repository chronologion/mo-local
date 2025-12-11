import type { IQuery } from '../../shared/ports/cqrsTypes';

export class ListProjectsQuery implements IQuery<'ListProjects'> {
  readonly type = 'ListProjects' as const;

  constructor(
    public readonly filter?: { status?: string; goalId?: string | null }
  ) {}
}
