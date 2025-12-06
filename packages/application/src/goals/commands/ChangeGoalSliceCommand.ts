import { GoalId, Slice, SliceValue, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeGoalSliceCommand {
  readonly type: 'ChangeGoalSlice';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeGoalSliceCommand {
  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeGoalSliceCommand(
  command: ChangeGoalSliceCommand
): CommandResult<ValidatedChangeGoalSliceCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const slice = safeConvert(() => Slice.of(command.slice), 'slice', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !goalId || !slice || !userId || !timestamp) {
    return failure(errors);
  }

  return success({ goalId, slice, userId, timestamp });
}
