import {
  ArchiveProjectCommand,
  ChangeProjectDatesCommand,
  ChangeProjectDescriptionCommand,
  ChangeProjectMilestoneNameCommand,
  ChangeProjectMilestoneTargetDateCommand,
  ChangeProjectNameCommand,
  ChangeProjectStatusCommand,
  AddProjectGoalCommand,
  RemoveProjectGoalCommand,
  AddProjectMilestoneCommand,
  DeleteProjectMilestoneCommand,
  CreateProjectCommand,
  validateArchiveProjectCommand,
  validateChangeProjectDatesCommand,
  validateChangeProjectDescriptionCommand,
  validateChangeProjectMilestoneNameCommand,
  validateChangeProjectMilestoneTargetDateCommand,
  validateChangeProjectNameCommand,
  validateChangeProjectStatusCommand,
  validateAddProjectGoalCommand,
  validateRemoveProjectGoalCommand,
  validateAddProjectMilestoneCommand,
  validateDeleteProjectMilestoneCommand,
  validateCreateProjectCommand,
} from '../commands';
import { CommandResult, failure } from '../../results/CommandResult';
import {
  ProjectCommandHandler,
  ProjectCommandResult,
} from '../handlers/ProjectCommandHandler';
import { ValidationException } from '../../errors/ValidationError';
import { SimpleBus } from '../../services/SimpleBus';

export type ProjectCommand =
  | CreateProjectCommand
  | ChangeProjectStatusCommand
  | ChangeProjectDatesCommand
  | ChangeProjectNameCommand
  | ChangeProjectDescriptionCommand
  | AddProjectGoalCommand
  | RemoveProjectGoalCommand
  | AddProjectMilestoneCommand
  | ChangeProjectMilestoneTargetDateCommand
  | ChangeProjectMilestoneNameCommand
  | DeleteProjectMilestoneCommand
  | ArchiveProjectCommand;

export class ProjectApplicationService {
  constructor(private readonly handler: ProjectCommandHandler) {}

  async handle(
    command: ProjectCommand
  ): Promise<CommandResult<ProjectCommandResult>> {
    try {
      switch (command.type) {
        case 'CreateProject': {
          const validated = validateCreateProjectCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleCreate(validated.value),
          };
        }
        case 'ChangeProjectStatus': {
          const validated = validateChangeProjectStatusCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeStatus(validated.value),
          };
        }
        case 'ChangeProjectDates': {
          const validated = validateChangeProjectDatesCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeDates(validated.value),
          };
        }
        case 'ChangeProjectName': {
          const validated = validateChangeProjectNameCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeName(validated.value),
          };
        }
        case 'ChangeProjectDescription': {
          const validated = validateChangeProjectDescriptionCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeDescription(validated.value),
          };
        }
        case 'AddProjectGoal': {
          const validated = validateAddProjectGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleAddGoal(validated.value),
          };
        }
        case 'RemoveProjectGoal': {
          const validated = validateRemoveProjectGoalCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleRemoveGoal(validated.value),
          };
        }
        case 'AddProjectMilestone': {
          const validated = validateAddProjectMilestoneCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleAddMilestone(validated.value),
          };
        }
        case 'ChangeProjectMilestoneTargetDate': {
          const validated =
            validateChangeProjectMilestoneTargetDateCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeMilestoneTargetDate(
              validated.value
            ),
          };
        }
        case 'ChangeProjectMilestoneName': {
          const validated = validateChangeProjectMilestoneNameCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleChangeMilestoneName(
              validated.value
            ),
          };
        }
        case 'DeleteProjectMilestone': {
          const validated = validateDeleteProjectMilestoneCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleDeleteMilestone(validated.value),
          };
        }
        case 'ArchiveProject': {
          const validated = validateArchiveProjectCommand(command);
          if (!validated.ok) return failure(validated.errors);
          return {
            ok: true,
            value: await this.handler.handleArchive(validated.value),
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
 * Registers project command handlers on a SimpleBus.
 */
export const registerProjectCommandHandlers = (
  bus: SimpleBus<ProjectCommand, CommandResult<ProjectCommandResult>>,
  handler: ProjectCommandHandler
): void => {
  bus.register('CreateProject', async (command: CreateProjectCommand) => {
    const validated = validateCreateProjectCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return { ok: true, value: await handler.handleCreate(validated.value) };
  });
  bus.register(
    'ChangeProjectStatus',
    async (command: ChangeProjectStatusCommand) => {
      const validated = validateChangeProjectStatusCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeStatus(validated.value),
      };
    }
  );
  bus.register(
    'ChangeProjectDates',
    async (command: ChangeProjectDatesCommand) => {
      const validated = validateChangeProjectDatesCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeDates(validated.value),
      };
    }
  );
  bus.register(
    'ChangeProjectName',
    async (command: ChangeProjectNameCommand) => {
      const validated = validateChangeProjectNameCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeName(validated.value),
      };
    }
  );
  bus.register(
    'ChangeProjectDescription',
    async (command: ChangeProjectDescriptionCommand) => {
      const validated = validateChangeProjectDescriptionCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeDescription(validated.value),
      };
    }
  );
  bus.register('AddProjectGoal', async (command: AddProjectGoalCommand) => {
    const validated = validateAddProjectGoalCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return { ok: true, value: await handler.handleAddGoal(validated.value) };
  });
  bus.register(
    'RemoveProjectGoal',
    async (command: RemoveProjectGoalCommand) => {
      const validated = validateRemoveProjectGoalCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleRemoveGoal(validated.value),
      };
    }
  );
  bus.register(
    'AddProjectMilestone',
    async (command: AddProjectMilestoneCommand) => {
      const validated = validateAddProjectMilestoneCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleAddMilestone(validated.value),
      };
    }
  );
  bus.register(
    'ChangeProjectMilestoneTargetDate',
    async (command: ChangeProjectMilestoneTargetDateCommand) => {
      const validated =
        validateChangeProjectMilestoneTargetDateCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeMilestoneTargetDate(validated.value),
      };
    }
  );
  bus.register(
    'ChangeProjectMilestoneName',
    async (command: ChangeProjectMilestoneNameCommand) => {
      const validated = validateChangeProjectMilestoneNameCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleChangeMilestoneName(validated.value),
      };
    }
  );
  bus.register(
    'DeleteProjectMilestone',
    async (command: DeleteProjectMilestoneCommand) => {
      const validated = validateDeleteProjectMilestoneCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return {
        ok: true,
        value: await handler.handleDeleteMilestone(validated.value),
      };
    }
  );
  bus.register('ArchiveProject', async (command: ArchiveProjectCommand) => {
    const validated = validateArchiveProjectCommand(command);
    if (!validated.ok) return failure(validated.errors);
    return { ok: true, value: await handler.handleArchive(validated.value) };
  });
};
