import {
  ChangeGoalPriorityCommand,
  ChangeGoalSliceCommand,
  ChangeGoalSummaryCommand,
  ChangeGoalTargetMonthCommand,
  CreateGoalCommand,
  DeleteGoalCommand,
  GrantGoalAccessCommand,
  RevokeGoalAccessCommand,
  validateChangeGoalPriorityCommand,
  validateChangeGoalSliceCommand,
  validateChangeGoalSummaryCommand,
  validateChangeGoalTargetMonthCommand,
  validateCreateGoalCommand,
  validateDeleteGoalCommand,
  validateGrantGoalAccessCommand,
  validateRevokeGoalAccessCommand,
} from '../commands';
import { CommandResult, failure } from '../results/CommandResult';
import { GoalCommandHandler, GoalCommandResult } from '../handlers/GoalCommandHandler';
import { ValidationException } from '../errors/ValidationError';

type GoalCommand =
  | CreateGoalCommand
  | ChangeGoalSummaryCommand
  | ChangeGoalSliceCommand
  | ChangeGoalTargetMonthCommand
  | ChangeGoalPriorityCommand
  | DeleteGoalCommand
  | GrantGoalAccessCommand
  | RevokeGoalAccessCommand;

/**
 * Validates incoming goal commands and delegates to GoalCommandHandler.
 */
export class GoalApplicationService {
  constructor(private readonly handler: GoalCommandHandler) {}

  async handle(command: GoalCommand): Promise<CommandResult<GoalCommandResult>> {
    try {
      switch (command.type) {
        case 'CreateGoal': {
          const validated = validateCreateGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleCreate(validated.value) };
        }
        case 'ChangeGoalSummary': {
          const validated = validateChangeGoalSummaryCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleChangeSummary(validated.value) };
        }
        case 'ChangeGoalSlice': {
          const validated = validateChangeGoalSliceCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleChangeSlice(validated.value) };
        }
        case 'ChangeGoalTargetMonth': {
          const validated = validateChangeGoalTargetMonthCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleChangeTargetMonth(validated.value) };
        }
        case 'ChangeGoalPriority': {
          const validated = validateChangeGoalPriorityCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleChangePriority(validated.value) };
        }
        case 'DeleteGoal': {
          const validated = validateDeleteGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleDelete(validated.value) };
        }
        case 'GrantGoalAccess': {
          const validated = validateGrantGoalAccessCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleGrantAccess(validated.value) };
        }
        case 'RevokeGoalAccess': {
          const validated = validateRevokeGoalAccessCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return { ok: true, value: await this.handler.handleRevokeAccess(validated.value) };
        }
        default:
          return failure([{ field: 'type', message: `Unsupported command ${command.type}` }]);
      }
    } catch (error) {
      if (error instanceof ValidationException) {
        return failure(error.details);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure([{ field: 'application', message }]);
    }
  }
}
