import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type AddProjectMilestonePayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  targetDate: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class AddProjectMilestone
  extends BaseCommand<AddProjectMilestonePayload>
  implements Readonly<AddProjectMilestonePayload>
{
  readonly type = 'AddProjectMilestone';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly name: string;
  readonly targetDate: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: AddProjectMilestonePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.targetDate = payload.targetDate;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
