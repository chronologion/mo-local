import {
  ProjectId,
  ProjectStatus,
  ProjectStatusValue,
  UserId,
} from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectStatus {
  readonly type: 'ChangeProjectStatus';
  readonly projectId: string;
  readonly status: ProjectStatusValue;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectStatusCommand {
  readonly projectId: ProjectId;
  readonly status: ProjectStatus;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectStatusCommand(
  command: ChangeProjectStatus
): CommandResult<ValidatedChangeProjectStatusCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.from(command.projectId),
    'projectId',
    errors
  );
  const status = safeConvert(
    () => ProjectStatus.from(command.status),
    'status',
    errors
  );
  const userId = safeConvert(
    () => UserId.from(command.userId),
    'userId',
    errors
  );
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (!projectId || !status || !userId || !timestamp || errors.length > 0) {
    return failure(errors);
  }

  return success({ projectId, status, userId, timestamp });
}
