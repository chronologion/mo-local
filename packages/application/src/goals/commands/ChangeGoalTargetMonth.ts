import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeGoalTargetMonthPayload = {
  goalId: string;
  targetMonth: string;
  userId: string;
  timestamp: number;
};

export class ChangeGoalTargetMonth
  extends BaseCommand<ChangeGoalTargetMonthPayload>
  implements Readonly<ChangeGoalTargetMonthPayload>
{
  readonly type = 'ChangeGoalTargetMonth';
  readonly goalId: string;
  readonly targetMonth: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalTargetMonthPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.targetMonth = payload.targetMonth;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
