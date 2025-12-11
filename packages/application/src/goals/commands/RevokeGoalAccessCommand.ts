import { BaseCommand } from '../../cqrs/BaseCommand';

export type RevokeGoalAccessCommandPayload = {
  goalId: string;
  revokeUserId: string;
  userId: string;
  timestamp: number;
};

export class RevokeGoalAccessCommand
  extends BaseCommand<RevokeGoalAccessCommandPayload>
  implements Readonly<RevokeGoalAccessCommandPayload>
{
  readonly type = 'RevokeGoalAccess';
  readonly goalId: string;
  readonly revokeUserId: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: RevokeGoalAccessCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.revokeUserId = payload.revokeUserId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
