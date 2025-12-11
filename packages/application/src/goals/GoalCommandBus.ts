import {
  ChangeGoalPriorityCommand,
  ChangeGoalSliceCommand,
  ChangeGoalSummaryCommand,
  ChangeGoalTargetMonthCommand,
  CreateGoalCommand,
  DeleteGoalCommand,
  GrantGoalAccessCommand,
  RevokeGoalAccessCommand,
} from './commands';
import {
  GoalCommandHandler,
  GoalCommandResult,
} from './handlers/GoalCommandHandler';
import { SimpleBus } from '../services/SimpleBus';
import { CommandResult, failure } from '../results/CommandResult';
import { ValidationException } from '../errors/ValidationError';

export type GoalCommand =
  | CreateGoalCommand
  | ChangeGoalSummaryCommand
  | ChangeGoalSliceCommand
  | ChangeGoalTargetMonthCommand
  | ChangeGoalPriorityCommand
  | DeleteGoalCommand
  | GrantGoalAccessCommand
  | RevokeGoalAccessCommand;

const toFailure = (error: unknown): CommandResult<GoalCommandResult> => {
  if (error instanceof ValidationException) {
    return failure(error.details);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return failure([{ field: 'application', message }]);
};

/**
 * Registers goal command handlers on the provided SimpleBus while wrapping
 * handler results into CommandResult envelopes.
 */
export const registerGoalCommandHandlers = (
  bus: SimpleBus<GoalCommand, CommandResult<GoalCommandResult>>,
  handler: GoalCommandHandler
): void => {
  const wrap = async <TCommand extends GoalCommand>(
    fn: (command: TCommand) => Promise<GoalCommandResult>,
    command: TCommand
  ): Promise<CommandResult<GoalCommandResult>> => {
    try {
      const value = await fn(command);
      return { ok: true, value };
    } catch (error) {
      return toFailure(error);
    }
  };

  bus.register('CreateGoal', (command: CreateGoalCommand) =>
    wrap(handler.handleCreate.bind(handler), command)
  );
  bus.register('ChangeGoalSummary', (command: ChangeGoalSummaryCommand) =>
    wrap(handler.handleChangeSummary.bind(handler), command)
  );
  bus.register('ChangeGoalSlice', (command: ChangeGoalSliceCommand) =>
    wrap(handler.handleChangeSlice.bind(handler), command)
  );
  bus.register(
    'ChangeGoalTargetMonth',
    (command: ChangeGoalTargetMonthCommand) =>
      wrap(handler.handleChangeTargetMonth.bind(handler), command)
  );
  bus.register('ChangeGoalPriority', (command: ChangeGoalPriorityCommand) =>
    wrap(handler.handleChangePriority.bind(handler), command)
  );
  bus.register('DeleteGoal', (command: DeleteGoalCommand) =>
    wrap(handler.handleDelete.bind(handler), command)
  );
  bus.register('GrantGoalAccess', (command: GrantGoalAccessCommand) =>
    wrap(handler.handleGrantAccess.bind(handler), command)
  );
  bus.register('RevokeGoalAccess', (command: RevokeGoalAccessCommand) =>
    wrap(handler.handleRevokeAccess.bind(handler), command)
  );
};
