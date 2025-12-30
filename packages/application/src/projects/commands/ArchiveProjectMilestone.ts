import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ArchiveProjectMilestonePayload = {
  projectId: string;
  milestoneId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
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
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ArchiveProjectMilestonePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
