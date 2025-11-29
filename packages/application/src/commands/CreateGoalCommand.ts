import {
  GoalId,
  Month,
  Priority,
  PriorityLevel,
  Slice,
  SliceValue,
  Summary,
  UserId,
} from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface CreateGoalCommand {
  readonly type: 'CreateGoal';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly summary: string;
  readonly targetMonth: string;
  readonly priority: PriorityLevel;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedCreateGoalCommand {
  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly summary: Summary;
  readonly targetMonth: Month;
  readonly priority: Priority;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateCreateGoalCommand(
  command: CreateGoalCommand
): CommandResult<ValidatedCreateGoalCommand> {
  const errors: ValidationError[] = [];

  const goalId = safeConvert(() => GoalId.of(command.goalId), 'goalId', errors);
  const slice = safeConvert(() => Slice.of(command.slice), 'slice', errors);
  const summary = safeConvert(
    () => Summary.of(command.summary),
    'summary',
    errors
  );
  const targetMonth = safeConvert(
    () => Month.fromString(command.targetMonth),
    'targetMonth',
    errors
  );
  const priority = safeConvert(
    () => Priority.of(command.priority),
    'priority',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    errors.length > 0 ||
    !goalId ||
    !slice ||
    !summary ||
    !targetMonth ||
    !priority ||
    !userId ||
    !timestamp
  ) {
    return failure(errors);
  }

  return success({
    goalId,
    slice,
    summary,
    targetMonth,
    priority,
    userId,
    timestamp,
  });
}
