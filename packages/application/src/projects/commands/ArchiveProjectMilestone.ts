import { MilestoneId, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ArchiveProjectMilestone {
  readonly type: 'ArchiveProjectMilestone';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedArchiveProjectMilestoneCommand {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateArchiveProjectMilestoneCommand(
  command: ArchiveProjectMilestone
): CommandResult<ValidatedArchiveProjectMilestoneCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.from(command.projectId),
    'projectId',
    errors
  );
  const milestoneId = safeConvert(
    () => MilestoneId.from(command.milestoneId),
    'milestoneId',
    errors
  );
  const userId = safeConvert(
    () => UserId.from(command.userId),
    'userId',
    errors
  );
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
