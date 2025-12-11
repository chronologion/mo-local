import type { IQuery } from '../../shared/ports/cqrsTypes';

export class SearchGoalsQuery implements IQuery<'SearchGoals'> {
  readonly type = 'SearchGoals' as const;

  constructor(
    public readonly term: string,
    public readonly filter?: {
      slice?: string;
      month?: string;
      priority?: string;
    }
  ) {}
}
