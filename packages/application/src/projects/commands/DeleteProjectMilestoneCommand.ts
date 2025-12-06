import { MilestoneId, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface DeleteProjectMilestoneCommand {
  readonly type: 'DeleteProjectMilestone';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedDeleteProjectMilestoneCommand {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateDeleteProjectMilestoneCommand(
  command: DeleteProjectMilestoneCommand
): CommandResult<ValidatedDeleteProjectMilestoneCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.of(command.projectId),
    'projectId',
    errors
  );
  const milestoneId = safeConvert(
    () => MilestoneId.of(command.milestoneId),
    'milestoneId',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    !projectId ||
    !milestoneId ||
    !userId ||
    !timestamp ||
    errors.length > 0
  ) {
    return failure(errors);
  }

  return success({ projectId, milestoneId, userId, timestamp });
}
