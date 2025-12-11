import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeGoalSummaryPayload = {
  goalId: string;
  summary: string;
  userId: string;
  timestamp: number;
};

export class ChangeGoalSummary
  extends BaseCommand<ChangeGoalSummaryPayload>
  implements Readonly<ChangeGoalSummaryPayload>
{
  readonly type = 'ChangeGoalSummary';
  readonly goalId: string;
  readonly summary: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalSummaryPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
