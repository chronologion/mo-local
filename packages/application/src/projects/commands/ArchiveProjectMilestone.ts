import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ArchiveProjectMilestonePayload = {
  projectId: string;
  milestoneId: string;
  timestamp: number;
  knownVersion: number;
};

export class ArchiveProjectMilestone
  extends BaseCommand<ArchiveProjectMilestonePayload>
  implements Readonly<ArchiveProjectMilestonePayload>
{
  readonly projectId: string;
  readonly milestoneId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ArchiveProjectMilestonePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
