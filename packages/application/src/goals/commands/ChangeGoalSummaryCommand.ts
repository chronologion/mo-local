import { BaseCommand } from '../../cqrs/BaseCommand';

export type ChangeGoalSummaryCommandPayload = {
  goalId: string;
  summary: string;
  userId: string;
  timestamp: number;
};

export class ChangeGoalSummaryCommand
  extends BaseCommand<ChangeGoalSummaryCommandPayload>
  implements Readonly<ChangeGoalSummaryCommandPayload>
{
  readonly type = 'ChangeGoalSummary';
  readonly goalId: string;
  readonly summary: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalSummaryCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
