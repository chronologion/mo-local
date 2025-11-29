import { GoalId, Priority, PriorityLevel, UserId } from '@mo/domain';
import { CommandResult, ValidationError, failure, success } from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface ChangeGoalPriorityCommand {
  readonly type: 'ChangeGoalPriority';
  readonly goalId: string;
  readonly priority: PriorityLevel;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeGoalPriorityCommand {
  readonly goalId: GoalId;
  readonly priority: Priority;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeGoalPriorityCommand(
  command: ChangeGoalPriorityCommand
): CommandResult<ValidatedChangeGoalPriorityCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const priority = safeConvert(() => Priority.of(command.priority), 'priority', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !priority || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, priority, userId, timestamp });
}
