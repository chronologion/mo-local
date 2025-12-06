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
} from '../../results/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectStatusCommand {
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
  command: ChangeProjectStatusCommand
): CommandResult<ValidatedChangeProjectStatusCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.of(command.projectId),
    'projectId',
    errors
  );
  const status = safeConvert(
    () => ProjectStatus.of(command.status),
    'status',
    errors
  );
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (!projectId || !status || !userId || !timestamp || errors.length > 0) {
    return failure(errors);
  }

  return success({ projectId, status, userId, timestamp });
}
