import { BaseCommand } from '../../cqrs/BaseCommand';

export type ChangeGoalTargetMonthCommandPayload = {
  goalId: string;
  targetMonth: string;
  userId: string;
  timestamp: number;
};

export class ChangeGoalTargetMonthCommand
  extends BaseCommand<ChangeGoalTargetMonthCommandPayload>
  implements Readonly<ChangeGoalTargetMonthCommandPayload>
{
  readonly type = 'ChangeGoalTargetMonth';
  readonly goalId: string;
  readonly targetMonth: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalTargetMonthCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.targetMonth = payload.targetMonth;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
