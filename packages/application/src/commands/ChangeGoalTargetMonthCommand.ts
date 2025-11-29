import { GoalId, Month, UserId } from '@mo/domain';
import { CommandResult, ValidationError, failure, success } from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface ChangeGoalTargetMonthCommand {
  readonly type: 'ChangeGoalTargetMonth';
  readonly goalId: string;
  readonly targetMonth: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeGoalTargetMonthCommand {
  readonly goalId: GoalId;
  readonly targetMonth: Month;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeGoalTargetMonthCommand(
  command: ChangeGoalTargetMonthCommand
): CommandResult<ValidatedChangeGoalTargetMonthCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const targetMonth = safeConvert(() => Month.fromString(command.targetMonth), 'targetMonth', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !targetMonth || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, targetMonth, userId, timestamp });
}
