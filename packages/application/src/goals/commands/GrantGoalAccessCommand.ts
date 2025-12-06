import { GoalId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export type AccessPermission = 'view' | 'edit';

export interface GrantGoalAccessCommand {
  readonly type: 'GrantGoalAccess';
  readonly goalId: string;
  readonly grantToUserId: string;
  readonly permission: AccessPermission;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedGrantGoalAccessCommand {
  readonly goalId: GoalId;
  readonly grantToUserId: UserId;
  readonly permission: AccessPermission;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateGrantGoalAccessCommand(
  command: GrantGoalAccessCommand
): CommandResult<ValidatedGrantGoalAccessCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const grantToUserId = safeConvert(
    () => UserId.of(command.grantToUserId),
    'grantToUserId',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const permission = validatePermission(
    command.permission,
    'permission',
    errors
  );
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    errors.length > 0 ||
    !goalId ||
    !grantToUserId ||
    !userId ||
    !permission ||
    !timestamp
  ) {
    return failure(errors);
  }

  return success({ goalId, grantToUserId, permission, userId, timestamp });
}

const validatePermission = (
  permission: string,
  field: string,
  errors: ValidationError[]
): AccessPermission | null => {
  if (permission === 'view' || permission === 'edit') {
    return permission;
  }
  errors.push({ field, message: 'Permission must be view or edit' });
  return null;
};
