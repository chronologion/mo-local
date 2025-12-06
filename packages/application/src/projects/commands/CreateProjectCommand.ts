import {
  GoalId,
  LocalDate,
  ProjectDescription,
  ProjectId,
  ProjectName,
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

export interface CreateProjectCommand {
  readonly type: 'CreateProject';
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatusValue;
  readonly startDate: string;
  readonly targetDate: string;
  readonly description?: string;
  readonly goalId?: string | null;
  readonly userId: string;
  readonly timestamp: number;
}

export interface ValidatedCreateProjectCommand {
  readonly projectId: ProjectId;
  readonly name: ProjectName;
  readonly status: ProjectStatus;
  readonly startDate: LocalDate;
  readonly targetDate: LocalDate;
  readonly description: ProjectDescription;
  readonly goalId: GoalId | null;
  readonly userId: UserId;
  readonly timestamp: Date;
}

export function validateCreateProjectCommand(
  command: CreateProjectCommand
): CommandResult<ValidatedCreateProjectCommand> {
  const errors: ValidationError[] = [];

  const projectId = safeConvert(
    () => ProjectId.of(command.projectId),
    'projectId',
    errors
  );
  const name = safeConvert(() => ProjectName.of(command.name), 'name', errors);
  const status = safeConvert(
    () => ProjectStatus.of(command.status),
    'status',
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
  const description = safeConvert(
    () => ProjectDescription.of(command.description ?? ''),
    'description',
    errors
  );
  const goalId = command.goalId
    ? safeConvert(() => GoalId.of(command.goalId as string), 'goalId', errors)
    : null;
  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    errors.length > 0 ||
    !projectId ||
    !name ||
    !status ||
    !startDate ||
    !targetDate ||
    !description ||
    !userId ||
    !timestamp
  ) {
    return failure(errors);
  }

  return success({
    projectId,
    name,
    status,
    startDate,
    targetDate,
    description,
    goalId: goalId ?? null,
    userId,
    timestamp,
  });
}
