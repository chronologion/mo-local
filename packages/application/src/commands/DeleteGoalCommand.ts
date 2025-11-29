import { GoalId, UserId } from '@mo/domain';
import { CommandResult, ValidationError, failure, success } from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface DeleteGoalCommand {
  readonly type: 'DeleteGoal';
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedDeleteGoalCommand {
  readonly goalId: GoalId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateDeleteGoalCommand(
  command: DeleteGoalCommand
): CommandResult<ValidatedDeleteGoalCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, userId, timestamp });
}
