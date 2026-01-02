import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type AccessPermission = 'view' | 'edit';

export type GrantGoalAccessPayload = {
  goalId: string;
  grantToUserId: string;
  permission: AccessPermission;
  timestamp: number;
  knownVersion: number;
};

export class GrantGoalAccess extends BaseCommand<GrantGoalAccessPayload> implements Readonly<GrantGoalAccessPayload> {
  readonly goalId: string;
  readonly grantToUserId: string;
  readonly permission: AccessPermission;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: GrantGoalAccessPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.grantToUserId = payload.grantToUserId;
    this.permission = payload.permission;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
