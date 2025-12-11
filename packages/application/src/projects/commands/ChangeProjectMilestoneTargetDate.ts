import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeProjectMilestoneTargetDatePayload = {
  projectId: string;
  milestoneId: string;
  targetDate: string;
  userId: string;
  timestamp: number;
};

export class ChangeProjectMilestoneTargetDate
  extends BaseCommand<ChangeProjectMilestoneTargetDatePayload>
  implements Readonly<ChangeProjectMilestoneTargetDatePayload>
{
  readonly type = 'ChangeProjectMilestoneTargetDate';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly targetDate: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeProjectMilestoneTargetDatePayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.targetDate = payload.targetDate;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
