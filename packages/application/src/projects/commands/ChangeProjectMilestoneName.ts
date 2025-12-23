import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeProjectMilestoneNamePayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectMilestoneName
  extends BaseCommand<ChangeProjectMilestoneNamePayload>
  implements Readonly<ChangeProjectMilestoneNamePayload>
{
  readonly type = 'ChangeProjectMilestoneName';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly name: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectMilestoneNamePayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
