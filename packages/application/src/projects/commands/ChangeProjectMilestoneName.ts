import { MilestoneId, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectMilestoneName {
  readonly type: 'ChangeProjectMilestoneName';
  readonly projectId: string;
  readonly milestoneId: string;
  readonly name: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectMilestoneNameCommand {
  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly name: string;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectMilestoneNameCommand(
  command: ChangeProjectMilestoneName
): CommandResult<ValidatedChangeProjectMilestoneNameCommand> {
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
  const name =
    command.name && command.name.trim().length > 0
      ? command.name
      : (errors.push({ field: 'name', message: 'name must be non-empty' }),
        null);
  const userId = safeConvert(
    () => UserId.from(command.userId),
    'userId',
    errors
  );
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    !projectId ||
    !milestoneId ||
    !name ||
    !userId ||
    !timestamp ||
    errors.length > 0
  ) {
    return failure(errors);
  }

  return success({ projectId, milestoneId, name, userId, timestamp });
}
