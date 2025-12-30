import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type RevokeGoalAccessPayload = {
  goalId: string;
  revokeUserId: string;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class RevokeGoalAccess
  extends BaseCommand<RevokeGoalAccessPayload>
  implements Readonly<RevokeGoalAccessPayload>
{
  readonly type = 'RevokeGoalAccess';
  readonly goalId: string;
  readonly revokeUserId: string;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: RevokeGoalAccessPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.revokeUserId = payload.revokeUserId;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
