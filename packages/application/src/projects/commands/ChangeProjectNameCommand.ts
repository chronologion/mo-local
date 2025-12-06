import { ProjectId, ProjectName, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectNameCommand {
  readonly type: 'ChangeProjectName';
  readonly projectId: string;
  readonly name: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectNameCommand {
  readonly projectId: ProjectId;
  readonly name: ProjectName;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectNameCommand(
  command: ChangeProjectNameCommand
): CommandResult<ValidatedChangeProjectNameCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.of(command.projectId),
    'projectId',
    errors
  );
  const name = safeConvert(() => ProjectName.of(command.name), 'name', errors);
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (!projectId || !name || !userId || !timestamp || errors.length > 0) {
    return failure(errors);
  }

  return success({ projectId, name, userId, timestamp });
}
