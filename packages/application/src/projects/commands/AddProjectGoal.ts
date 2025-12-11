import { GoalId, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface AddProjectGoal {
  readonly type: 'AddProjectGoal';
  readonly projectId: string;
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedAddProjectGoalCommand {
  readonly projectId: ProjectId;
  readonly goalId: GoalId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateAddProjectGoalCommand(
  command: AddProjectGoal
): CommandResult<ValidatedAddProjectGoalCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.from(command.projectId),
    'projectId',
    errors
  );
  const goalId = safeConvert(
    () => GoalId.from(command.goalId),
    'goalId',
    errors
  );
  const userId = safeConvert(
    () => UserId.from(command.userId),
    'userId',
    errors
  );
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (!projectId || !goalId || !userId || !timestamp || errors.length > 0) {
    return failure(errors);
  }

  return success({ projectId, goalId, userId, timestamp });
}
