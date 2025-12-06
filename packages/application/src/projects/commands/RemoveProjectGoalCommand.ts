import { ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface RemoveProjectGoalCommand {
  readonly type: 'RemoveProjectGoal';
  readonly projectId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedRemoveProjectGoalCommand {
  readonly projectId: ProjectId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateRemoveProjectGoalCommand(
  command: RemoveProjectGoalCommand
): CommandResult<ValidatedRemoveProjectGoalCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.of(command.projectId),
    'projectId',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (!projectId || !userId || !timestamp || errors.length > 0) {
    return failure(errors);
  }

  return success({ projectId, userId, timestamp });
}
