import {
  AddProjectGoal,
  AddProjectMilestone,
  ArchiveProject,
  ArchiveProjectMilestone,
  ChangeProjectDates,
  ChangeProjectDescription,
  ChangeProjectMilestoneName,
  ChangeProjectMilestoneTargetDate,
  ChangeProjectName,
  ChangeProjectStatus,
  CreateProject,
  GetProjectByIdQuery,
  ListProjectsQuery,
  ProjectCommand,
  ProjectCommandHandler,
  ProjectCommandResult,
  ProjectQuery,
  ProjectQueryHandler,
  ProjectQueryResult,
  SearchProjectsQuery,
  RemoveProjectGoal,
  validateArchiveProjectCommand,
  validateArchiveProjectMilestoneCommand,
  validateAddProjectGoalCommand,
  validateAddProjectMilestoneCommand,
  validateChangeProjectDatesCommand,
  validateChangeProjectDescriptionCommand,
  validateChangeProjectMilestoneNameCommand,
  validateChangeProjectMilestoneTargetDateCommand,
  validateChangeProjectNameCommand,
  validateChangeProjectStatusCommand,
  validateCreateProjectCommand,
  validateRemoveProjectGoalCommand,
  CommandResult,
  ValidationException,
  failure,
  IEventBus,
} from '@mo/application';
import type { Store } from '@livestore/livestore';
import { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { ProjectRepository } from './ProjectRepository';
import { ProjectProjectionProcessor } from './projection/ProjectProjectionProcessor';
import { ProjectReadModel } from './ProjectReadModel';
import type { BrowserLiveStoreEventStore } from '../browser/LiveStoreEventStore';
import type { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { SimpleBus } from '../bus/SimpleBus';

export type ProjectBoundedContextServices = {
  projectRepo: ProjectRepository;
  projectProjection: ProjectProjectionProcessor;
  projectReadModel: ProjectReadModel;
  projectCommandBus: SimpleBus<
    ProjectCommand,
    CommandResult<ProjectCommandResult>
  >;
  projectQueryBus: SimpleBus<ProjectQuery, ProjectQueryResult>;
};

export type ProjectBootstrapDeps = {
  store: Store;
  eventStore: BrowserLiveStoreEventStore;
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  eventBus: IEventBus;
  toDomain: LiveStoreToDomainAdapter;
};

const toProjectFailure = (
  error: unknown
): CommandResult<ProjectCommandResult> => {
  if (error instanceof ValidationException) {
    return failure(error.details);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return failure([{ field: 'application', message }]);
};

export const bootstrapProjectBoundedContext = ({
  store,
  eventStore,
  crypto,
  keyStore,
  eventBus,
  toDomain,
}: ProjectBootstrapDeps): ProjectBoundedContextServices => {
  const projectRepo = new ProjectRepository(
    eventStore,
    store,
    crypto,
    async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
  );
  const projectHandler = new ProjectCommandHandler(
    projectRepo,
    keyStore,
    crypto,
    eventBus
  );
  const projectProjection = new ProjectProjectionProcessor(
    store,
    eventStore,
    crypto,
    keyStore,
    toDomain
  );
  const projectReadModel = new ProjectReadModel(projectProjection);
  const projectCommandBus = buildProjectCommandBus(projectHandler);
  const projectQueryBus = buildProjectQueryBus(projectReadModel);

  return {
    projectRepo,
    projectProjection,
    projectReadModel,
    projectCommandBus,
    projectQueryBus,
  };
};

const buildProjectCommandBus = (
  handler: ProjectCommandHandler
): SimpleBus<ProjectCommand, CommandResult<ProjectCommandResult>> => {
  const projectCommandBus = new SimpleBus<
    ProjectCommand,
    CommandResult<ProjectCommandResult>
  >();
  const wrapProject = async <TValidated>(
    fn: (command: TValidated) => Promise<ProjectCommandResult>,
    command: TValidated
  ): Promise<CommandResult<ProjectCommandResult>> => {
    try {
      const value = await fn(command);
      return { ok: true, value };
    } catch (error) {
      return toProjectFailure(error);
    }
  };

  projectCommandBus.register(
    'CreateProject',
    async (command: CreateProject) => {
      const validated = validateCreateProjectCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(handler.handleCreate.bind(handler), validated.value);
    }
  );

  projectCommandBus.register(
    'ChangeProjectStatus',
    async (command: ChangeProjectStatus) => {
      const validated = validateChangeProjectStatusCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeStatus.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectDates',
    async (command: ChangeProjectDates) => {
      const validated = validateChangeProjectDatesCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeDates.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectName',
    async (command: ChangeProjectName) => {
      const validated = validateChangeProjectNameCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeName.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectDescription',
    async (command: ChangeProjectDescription) => {
      const validated = validateChangeProjectDescriptionCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeDescription.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'AddProjectGoal',
    async (command: AddProjectGoal) => {
      const validated = validateAddProjectGoalCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(handler.handleAddGoal.bind(handler), validated.value);
    }
  );

  projectCommandBus.register(
    'RemoveProjectGoal',
    async (command: RemoveProjectGoal) => {
      const validated = validateRemoveProjectGoalCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleRemoveGoal.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'AddProjectMilestone',
    async (command: AddProjectMilestone) => {
      const validated = validateAddProjectMilestoneCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleAddMilestone.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectMilestoneTargetDate',
    async (command: ChangeProjectMilestoneTargetDate) => {
      const validated =
        validateChangeProjectMilestoneTargetDateCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeMilestoneTargetDate.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectMilestoneName',
    async (command: ChangeProjectMilestoneName) => {
      const validated = validateChangeProjectMilestoneNameCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleChangeMilestoneName.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ArchiveProjectMilestone',
    async (command: ArchiveProjectMilestone) => {
      const validated = validateArchiveProjectMilestoneCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        handler.handleArchiveMilestone.bind(handler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ArchiveProject',
    async (command: ArchiveProject) => {
      const validated = validateArchiveProjectCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(handler.handleArchive.bind(handler), validated.value);
    }
  );

  return projectCommandBus;
};

const buildProjectQueryBus = (
  readModel: ProjectReadModel
): SimpleBus<ProjectQuery, ProjectQueryResult> => {
  const projectQueryBus = new SimpleBus<ProjectQuery, ProjectQueryResult>();
  const projectQueryHandler = new ProjectQueryHandler(readModel);
  projectQueryBus.register('ListProjects', (query: ListProjectsQuery) =>
    projectQueryHandler.execute(query)
  );
  projectQueryBus.register('GetProjectById', (query: GetProjectByIdQuery) =>
    projectQueryHandler.execute(query)
  );
  projectQueryBus.register('SearchProjects', (query: SearchProjectsQuery) =>
    projectQueryHandler.execute(query)
  );
  return projectQueryBus;
};
