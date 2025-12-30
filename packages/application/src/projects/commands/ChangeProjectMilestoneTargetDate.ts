import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectMilestoneTargetDatePayload = {
  projectId: string;
  milestoneId: string;
  targetDate: string;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeProjectMilestoneTargetDate
  extends BaseCommand<ChangeProjectMilestoneTargetDatePayload>
  implements Readonly<ChangeProjectMilestoneTargetDatePayload>
{
  readonly type = 'ChangeProjectMilestoneTargetDate';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly targetDate: string;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(
    payload: ChangeProjectMilestoneTargetDatePayload,
    meta?: CommandMetadata
  ) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.targetDate = payload.targetDate;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
