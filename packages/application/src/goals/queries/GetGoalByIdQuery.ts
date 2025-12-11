import type { IQuery } from '../../shared/ports/cqrsTypes';

export class GetGoalByIdQuery implements IQuery<'GetGoalById'> {
  readonly type = 'GetGoalById' as const;

  constructor(public readonly goalId: string) {}
}
