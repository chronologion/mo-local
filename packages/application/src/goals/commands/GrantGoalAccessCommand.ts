import { BaseCommand } from '../../cqrs/BaseCommand';

export type AccessPermission = 'view' | 'edit';

export type GrantGoalAccessCommandPayload = {
  goalId: string;
  grantToUserId: string;
  permission: AccessPermission;
  userId: string;
  timestamp: number;
};

export class GrantGoalAccessCommand
  extends BaseCommand<GrantGoalAccessCommandPayload>
  implements Readonly<GrantGoalAccessCommandPayload>
{
  readonly type = 'GrantGoalAccess';
  readonly goalId: string;
  readonly grantToUserId: string;
  readonly permission: AccessPermission;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: GrantGoalAccessCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.grantToUserId = payload.grantToUserId;
    this.permission = payload.permission;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
