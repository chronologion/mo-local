import { LocalDate, MilestoneId, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectMilestoneTargetDate {
  readonly type: 'ChangeProjectMilestoneTargetDate';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly targetDate: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectMilestoneTargetDateCommand {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly targetDate: LocalDate;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectMilestoneTargetDateCommand(
  command: ChangeProjectMilestoneTargetDate
): CommandResult<ValidatedChangeProjectMilestoneTargetDateCommand> {
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
  const targetDate = safeConvert(
    () => LocalDate.fromString(command.targetDate),
    'targetDate',
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
    !targetDate ||
    !userId ||
    !timestamp ||
    errors.length > 0
  ) {
    return failure(errors);
  }

  return success({
    projectId,
    milestoneId,
    targetDate,
    userId,
    timestamp,
  });
}
