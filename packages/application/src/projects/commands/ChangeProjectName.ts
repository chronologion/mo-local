import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectNamePayload = {
  projectId: string;
  name: string;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeProjectName
  extends BaseCommand<ChangeProjectNamePayload>
  implements Readonly<ChangeProjectNamePayload>
{
  readonly type = 'ChangeProjectName';
  readonly projectId: string;
  readonly name: string;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeProjectNamePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
