import { ProjectStatusValue } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectStatusPayload = {
  projectId: string;
  status: ProjectStatusValue;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeProjectStatus
  extends BaseCommand<ChangeProjectStatusPayload>
  implements Readonly<ChangeProjectStatusPayload>
{
  readonly type = 'ChangeProjectStatus';
  readonly projectId: string;
  readonly status: ProjectStatusValue;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeProjectStatusPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.status = payload.status;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
