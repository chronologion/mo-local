import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectDescriptionPayload = {
  projectId: string;
  description: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeProjectDescription
  extends BaseCommand<ChangeProjectDescriptionPayload>
  implements Readonly<ChangeProjectDescriptionPayload>
{
  readonly type = 'ChangeProjectDescription';
  readonly projectId: string;
  readonly description: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(
    payload: ChangeProjectDescriptionPayload,
    meta?: CommandMetadata
  ) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.description = payload.description;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
