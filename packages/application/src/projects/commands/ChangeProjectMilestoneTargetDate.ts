import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectMilestoneTargetDatePayload = {
  projectId: string;
  milestoneId: string;
  targetDate: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectMilestoneTargetDate
  extends BaseCommand<ChangeProjectMilestoneTargetDatePayload>
  implements Readonly<ChangeProjectMilestoneTargetDatePayload>
{
  readonly projectId: string;
  readonly milestoneId: string;
  readonly targetDate: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(
    payload: ChangeProjectMilestoneTargetDatePayload,
    meta?: CommandMetadata
  ) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.targetDate = payload.targetDate;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
