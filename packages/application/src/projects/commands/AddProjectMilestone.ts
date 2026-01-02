import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type AddProjectMilestonePayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  targetDate: string;
  timestamp: number;
  knownVersion: number;
};

export class AddProjectMilestone
  extends BaseCommand<AddProjectMilestonePayload>
  implements Readonly<AddProjectMilestonePayload>
{
  readonly projectId: string;
  readonly milestoneId: string;
  readonly name: string;
  readonly targetDate: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: AddProjectMilestonePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.targetDate = payload.targetDate;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
