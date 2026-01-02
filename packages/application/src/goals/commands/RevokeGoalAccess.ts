import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type RevokeGoalAccessPayload = {
  goalId: string;
  revokeUserId: string;
  timestamp: number;
  knownVersion: number;
};

export class RevokeGoalAccess
  extends BaseCommand<RevokeGoalAccessPayload>
  implements Readonly<RevokeGoalAccessPayload>
{
  readonly goalId: string;
  readonly revokeUserId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: RevokeGoalAccessPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.revokeUserId = payload.revokeUserId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
