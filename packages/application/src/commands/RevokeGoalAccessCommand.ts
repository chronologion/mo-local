import { GoalId, UserId } from '@mo/domain';
import { CommandResult, ValidationError, failure, success } from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface RevokeGoalAccessCommand {
  readonly type: 'RevokeGoalAccess';
  readonly goalId: string;
  readonly revokeUserId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedRevokeGoalAccessCommand {
  readonly goalId: GoalId;
  readonly revokeUserId: UserId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateRevokeGoalAccessCommand(
  command: RevokeGoalAccessCommand
): CommandResult<ValidatedRevokeGoalAccessCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const revokeUserId = safeConvert(() => UserId.of(command.revokeUserId), 'revokeUserId', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !revokeUserId || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, revokeUserId, userId, timestamp });
}
