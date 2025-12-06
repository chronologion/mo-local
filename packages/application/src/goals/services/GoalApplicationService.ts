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
import { CommandResult, failure } from '../../results/CommandResult';
import {
  GoalCommandHandler,
  GoalCommandResult,
} from '../handlers/GoalCommandHandler';
import { ValidationException } from '../../errors/ValidationError';
import { SimpleBus } from '../../services/SimpleBus';

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
 * Legacy application service to validate and dispatch goal commands.
 * Prefer using the command bus created by `registerGoalCommandHandlers`.
 */
export class GoalApplicationService {
  constructor(private readonly handler: GoalCommandHandler) {}

  async handle(
    command: GoalCommand
  ): Promise<CommandResult<GoalCommandResult>> {
    try {
      switch (command.type) {
        case 'CreateGoal': {
          const validated = validateCreateGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleCreate(validated.value),
          };
        }
        case 'ChangeGoalSummary': {
          const validated = validateChangeGoalSummaryCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeSummary(validated.value),
          };
        }
        case 'ChangeGoalSlice': {
          const validated = validateChangeGoalSliceCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeSlice(validated.value),
          };
        }
        case 'ChangeGoalTargetMonth': {
          const validated = validateChangeGoalTargetMonthCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeTargetMonth(validated.value),
          };
        }
        case 'ChangeGoalPriority': {
          const validated = validateChangeGoalPriorityCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangePriority(validated.value),
          };
        }
        case 'DeleteGoal': {
          const validated = validateDeleteGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleDelete(validated.value),
          };
        }
        case 'GrantGoalAccess': {
          const validated = validateGrantGoalAccessCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleGrantAccess(validated.value),
          };
        }
        case 'RevokeGoalAccess': {
          const validated = validateRevokeGoalAccessCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleRevokeAccess(validated.value),
          };
        }
        default:
          return failure([{ field: 'type', message: 'Unsupported command' }]);
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

/**
 * Registers goal command handlers on a CommandBus.
 */
export const registerGoalCommandHandlers = (
  bus: SimpleBus<{ type: string }, CommandResult<GoalCommandResult>>,
  handler: GoalCommandHandler
): void => {
  bus.register('CreateGoal', async (command: CreateGoalCommand) => {
    const validated = validateCreateGoalCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return { ok: true, value: await handler.handleCreate(validated.value) };
  });
  bus.register(
    'ChangeGoalSummary',
    async (command: ChangeGoalSummaryCommand) => {
      const validated = validateChangeGoalSummaryCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeSummary(validated.value),
      };
    }
  );
  bus.register('ChangeGoalSlice', async (command: ChangeGoalSliceCommand) => {
    const validated = validateChangeGoalSliceCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return {
      ok: true,
      value: await handler.handleChangeSlice(validated.value),
    };
  });
  bus.register(
    'ChangeGoalTargetMonth',
    async (command: ChangeGoalTargetMonthCommand) => {
      const validated = validateChangeGoalTargetMonthCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeTargetMonth(validated.value),
      };
    }
  );
  bus.register(
    'ChangeGoalPriority',
    async (command: ChangeGoalPriorityCommand) => {
      const validated = validateChangeGoalPriorityCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangePriority(validated.value),
      };
    }
  );
  bus.register('DeleteGoal', async (command: DeleteGoalCommand) => {
    const validated = validateDeleteGoalCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return { ok: true, value: await handler.handleDelete(validated.value) };
  });
  bus.register('GrantGoalAccess', async (command: GrantGoalAccessCommand) => {
    const validated = validateGrantGoalAccessCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return {
      ok: true,
      value: await handler.handleGrantAccess(validated.value),
    };
  });
  bus.register('RevokeGoalAccess', async (command: RevokeGoalAccessCommand) => {
    const validated = validateRevokeGoalAccessCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return {
      ok: true,
      value: await handler.handleRevokeAccess(validated.value),
    };
  });
};
