import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectMilestoneNamePayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeProjectMilestoneName
  extends BaseCommand<ChangeProjectMilestoneNamePayload>
  implements Readonly<ChangeProjectMilestoneNamePayload>
{
  readonly type = 'ChangeProjectMilestoneName';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly name: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(
    payload: ChangeProjectMilestoneNamePayload,
    meta?: CommandMetadata
  ) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
