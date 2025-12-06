import { GoalId, Summary, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeGoalSummaryCommand {
  readonly type: 'ChangeGoalSummary';
  readonly goalId: string;
  readonly summary: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeGoalSummaryCommand {
  readonly goalId: GoalId;
  readonly summary: Summary;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeGoalSummaryCommand(
  command: ChangeGoalSummaryCommand
): CommandResult<ValidatedChangeGoalSummaryCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const summary = safeConvert(
    () => Summary.of(command.summary),
    'summary',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !summary || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, summary, userId, timestamp });
}
