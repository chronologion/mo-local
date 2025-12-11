import { LocalDate, ProjectId, UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface ChangeProjectDates {
  readonly type: 'ChangeProjectDates';
  readonly projectId: string;
  readonly startDate: string;
  readonly targetDate: string;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedChangeProjectDatesCommand {
  readonly projectId: ProjectId;
  readonly startDate: LocalDate;
  readonly targetDate: LocalDate;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateChangeProjectDatesCommand(
  command: ChangeProjectDates
): CommandResult<ValidatedChangeProjectDatesCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.from(command.projectId),
    'projectId',
    errors
  );
  const startDate = safeConvert(
    () => LocalDate.fromString(command.startDate),
    'startDate',
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
    !startDate ||
    !targetDate ||
    !userId ||
    !timestamp ||
    errors.length > 0
  ) {
    return failure(errors);
  }

  return success({
    projectId,
    startDate,
    targetDate,
    userId,
    timestamp,
  });
}
