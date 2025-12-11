import type { IQuery } from '../../shared/ports/cqrsTypes';

export class ListGoalsQuery implements IQuery<'ListGoals'> {
  readonly type = 'ListGoals' as const;

  constructor(
    public readonly filter?: {
      slice?: string;
      month?: string;
      priority?: string;
    }
  ) {}
}
