import { BaseCommand } from '../../shared/ports/BaseCommand';

export type AccessPermission = 'view' | 'edit';

export type GrantGoalAccessPayload = {
  goalId: string;
  grantToUserId: string;
  permission: AccessPermission;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class GrantGoalAccess
  extends BaseCommand<GrantGoalAccessPayload>
  implements Readonly<GrantGoalAccessPayload>
{
  readonly type = 'GrantGoalAccess';
  readonly goalId: string;
  readonly grantToUserId: string;
  readonly permission: AccessPermission;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: GrantGoalAccessPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.grantToUserId = payload.grantToUserId;
    this.permission = payload.permission;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
