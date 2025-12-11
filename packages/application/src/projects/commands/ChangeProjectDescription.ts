import { ProjectDescription, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectDescription {
  readonly type: 'ChangeProjectDescription';
  readonly projectId: string;
  readonly description: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectDescriptionCommand {
  readonly projectId: ProjectId;
  readonly description: ProjectDescription;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectDescriptionCommand(
  command: ChangeProjectDescription
): CommandResult<ValidatedChangeProjectDescriptionCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.from(command.projectId),
    'projectId',
    errors
  );
  const description = safeConvert(
    () => ProjectDescription.from(command.description),
    'description',
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
    !description ||
    !userId ||
    !timestamp ||
    errors.length > 0
  ) {
    return failure(errors);
  }

  return success({ projectId, description, userId, timestamp });
}
