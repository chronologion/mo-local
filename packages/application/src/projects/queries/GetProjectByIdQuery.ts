import type { IQuery } from '../../shared/ports/cqrsTypes';

export class GetProjectByIdQuery implements IQuery<'GetProjectById'> {
  readonly type = 'GetProjectById' as const;

  constructor(public readonly projectId: string) {}
}
