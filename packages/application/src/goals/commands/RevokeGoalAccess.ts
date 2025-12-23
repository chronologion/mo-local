import { BaseCommand } from '../../shared/ports/BaseCommand';

export type RevokeGoalAccessPayload = {
  goalId: string;
  revokeUserId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class RevokeGoalAccess
  extends BaseCommand<RevokeGoalAccessPayload>
  implements Readonly<RevokeGoalAccessPayload>
{
  readonly type = 'RevokeGoalAccess';
  readonly goalId: string;
  readonly revokeUserId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: RevokeGoalAccessPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.revokeUserId = payload.revokeUserId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
