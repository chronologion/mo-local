import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ArchiveProjectMilestonePayload = {
  projectId: string;
  milestoneId: string;
  userId: string;
  timestamp: number;
};

export class ArchiveProjectMilestone
  extends BaseCommand<ArchiveProjectMilestonePayload>
  implements Readonly<ArchiveProjectMilestonePayload>
{
  readonly type = 'ArchiveProjectMilestone';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ArchiveProjectMilestonePayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
