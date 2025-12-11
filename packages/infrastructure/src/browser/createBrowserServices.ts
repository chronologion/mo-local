import {
  createStorePromise,
  type Store,
  type Adapter,
} from '@livestore/livestore';
import {
  GoalCommandHandler,
  ProjectCommandHandler,
  IEventBus,
  CreateGoal,
  ChangeGoalSummary,
  ChangeGoalSlice,
  ChangeGoalTargetMonth,
  ChangeGoalPriority,
  ArchiveGoal,
  GrantGoalAccess,
  RevokeGoalAccess,
  GoalCommand,
  GoalCommandResult,
  CreateProject,
  ChangeProjectStatus,
  ChangeProjectDates,
  ChangeProjectName,
  ChangeProjectDescription,
  AddProjectGoal,
  RemoveProjectGoal,
  AddProjectMilestone,
  ChangeProjectMilestoneTargetDate,
  ChangeProjectMilestoneName,
  ArchiveProjectMilestone,
  ArchiveProject,
  validateArchiveProjectCommand,
  validateAddProjectGoalCommand,
  validateAddProjectMilestoneCommand,
  validateArchiveProjectMilestoneCommand,
  validateChangeProjectDatesCommand,
  validateChangeProjectDescriptionCommand,
  validateChangeProjectMilestoneNameCommand,
  validateChangeProjectMilestoneTargetDateCommand,
  validateChangeProjectNameCommand,
  validateChangeProjectStatusCommand,
  validateCreateProjectCommand,
  validateRemoveProjectGoalCommand,
  ProjectCommand,
  ProjectCommandResult,
  CommandResult,
  ValidationException,
  ListGoalsQuery,
  GetGoalByIdQuery,
  SearchGoalsQuery,
  GoalQueryHandler,
  type GoalQuery,
  type GoalQueryResult,
  ListProjectsQuery,
  GetProjectByIdQuery,
  SearchProjectsQuery,
  ProjectQueryHandler,
  type ProjectQuery,
  type ProjectQueryResult,
  failure,
} from '@mo/application';
import { InMemoryEventBus } from '../events/InMemoryEventBus';
import { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { BrowserLiveStoreEventStore } from './LiveStoreEventStore';
import { GoalRepository } from '../goals/GoalRepository';
import { GoalQueries } from '../goals/GoalQueries';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { schema as defaultSchema, events as goalEvents } from '../goals/schema';
import { GoalProjectionProcessor } from '../goals/projection/GoalProjectionProcessor';
import { ProjectRepository } from '../projects/ProjectRepository';
import { ProjectQueries } from '../projects/ProjectQueries';
import { ProjectProjectionProcessor } from '../projects/projection/ProjectProjectionProcessor';
import { SimpleBus } from '../bus/SimpleBus';

const toGoalFailure = (error: unknown): CommandResult<GoalCommandResult> => {
  if (error instanceof ValidationException) {
    return failure(error.details);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return failure([{ field: 'application', message }]);
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

export type BrowserServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  store: Store;
  goalEventStore: BrowserLiveStoreEventStore;
  projectEventStore: BrowserLiveStoreEventStore;
  eventBus: IEventBus;
  goalRepo: GoalRepository;
  projectRepo: ProjectRepository;
  goalCommandBus: SimpleBus<GoalCommand, CommandResult<GoalCommandResult>>;
  projectCommandBus: SimpleBus<
    ProjectCommand,
    CommandResult<ProjectCommandResult>
  >;
  goalQueryBus: SimpleBus<GoalQuery, GoalQueryResult>;
  projectQueryBus: SimpleBus<ProjectQuery, ProjectQueryResult>;
  goalQueries: GoalQueries;
  projectQueries: ProjectQueries;
  goalProjection: GoalProjectionProcessor;
  projectProjection: ProjectProjectionProcessor;
};

export type BrowserServicesOptions = {
  adapter: Adapter;
  storeId?: string;
};

/**
 * Factory to construct browser goal services with LiveStore wiring contained in infra.
 * The caller supplies the schema and adapter (e.g., from @livestore/adapter-web).
 */
export const createBrowserServices = async ({
  adapter,
  storeId = 'mo-local-v2',
}: BrowserServicesOptions): Promise<BrowserServices> => {
  const effectiveSchema = defaultSchema;
  const crypto = new WebCryptoService();
  const keyStore = new IndexedDBKeyStore();
  const store = (await createStorePromise({
    schema: effectiveSchema,
    adapter,
    storeId,
  })) as unknown as Store;
  const goalEventStore = new BrowserLiveStoreEventStore(
    store,
    goalEvents.goalEvent as (payload: {
      id: string;
      aggregateId: string;
      eventType: string;
      payload: Uint8Array;
      version: number;
      occurredAt: number;
    }) => unknown
  );
  const projectEventStore = new BrowserLiveStoreEventStore(
    store,
    goalEvents.projectEvent as (payload: {
      id: string;
      aggregateId: string;
      eventType: string;
      payload: Uint8Array;
      version: number;
      occurredAt: number;
    }) => unknown,
    { events: 'project_events', snapshots: 'project_snapshots' }
  );
  const eventBus = new InMemoryEventBus();
  const goalRepo = new GoalRepository(
    goalEventStore,
    store,
    crypto,
    async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
  );
  const projectRepo = new ProjectRepository(
    projectEventStore,
    store,
    crypto,
    async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
  );
  const goalHandler = new GoalCommandHandler(
    goalRepo,
    keyStore,
    crypto,
    eventBus
  );
  const projectHandler = new ProjectCommandHandler(
    projectRepo,
    keyStore,
    crypto,
    eventBus
  );
  const goalCommandBus = new SimpleBus<
    GoalCommand,
    CommandResult<GoalCommandResult>
  >();
  const wrapGoal = async <TCommand extends GoalCommand>(
    fn: (command: TCommand) => Promise<GoalCommandResult>,
    command: TCommand
  ): Promise<CommandResult<GoalCommandResult>> => {
    try {
      const value = await fn(command);
      return { ok: true, value };
    } catch (error) {
      return toGoalFailure(error);
    }
  };

  goalCommandBus.register('CreateGoal', (command: CreateGoal) =>
    wrapGoal(goalHandler.handleCreate.bind(goalHandler), command)
  );
  goalCommandBus.register('ChangeGoalSummary', (command: ChangeGoalSummary) =>
    wrapGoal(goalHandler.handleChangeSummary.bind(goalHandler), command)
  );
  goalCommandBus.register('ChangeGoalSlice', (command: ChangeGoalSlice) =>
    wrapGoal(goalHandler.handleChangeSlice.bind(goalHandler), command)
  );
  goalCommandBus.register(
    'ChangeGoalTargetMonth',
    (command: ChangeGoalTargetMonth) =>
      wrapGoal(goalHandler.handleChangeTargetMonth.bind(goalHandler), command)
  );
  goalCommandBus.register('ChangeGoalPriority', (command: ChangeGoalPriority) =>
    wrapGoal(goalHandler.handleChangePriority.bind(goalHandler), command)
  );
  goalCommandBus.register('ArchiveGoal', (command: ArchiveGoal) =>
    wrapGoal(goalHandler.handleArchive.bind(goalHandler), command)
  );
  goalCommandBus.register('GrantGoalAccess', (command: GrantGoalAccess) =>
    wrapGoal(goalHandler.handleGrantAccess.bind(goalHandler), command)
  );
  goalCommandBus.register('RevokeGoalAccess', (command: RevokeGoalAccess) =>
    wrapGoal(goalHandler.handleRevokeAccess.bind(goalHandler), command)
  );
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
      return wrapProject(
        projectHandler.handleCreate.bind(projectHandler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ChangeProjectStatus',
    async (command: ChangeProjectStatus) => {
      const validated = validateChangeProjectStatusCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        projectHandler.handleChangeStatus.bind(projectHandler),
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
        projectHandler.handleChangeDates.bind(projectHandler),
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
        projectHandler.handleChangeName.bind(projectHandler),
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
        projectHandler.handleChangeDescription.bind(projectHandler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'AddProjectGoal',
    async (command: AddProjectGoal) => {
      const validated = validateAddProjectGoalCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        projectHandler.handleAddGoal.bind(projectHandler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'RemoveProjectGoal',
    async (command: RemoveProjectGoal) => {
      const validated = validateRemoveProjectGoalCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        projectHandler.handleRemoveGoal.bind(projectHandler),
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
        projectHandler.handleAddMilestone.bind(projectHandler),
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
        projectHandler.handleChangeMilestoneTargetDate.bind(projectHandler),
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
        projectHandler.handleChangeMilestoneName.bind(projectHandler),
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
        projectHandler.handleArchiveMilestone.bind(projectHandler),
        validated.value
      );
    }
  );

  projectCommandBus.register(
    'ArchiveProject',
    async (command: ArchiveProject) => {
      const validated = validateArchiveProjectCommand(command);
      if (!validated.ok) return failure(validated.errors);
      return wrapProject(
        projectHandler.handleArchive.bind(projectHandler),
        validated.value
      );
    }
  );
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const goalProjection = new GoalProjectionProcessor(
    store,
    goalEventStore,
    crypto,
    keyStore,
    toDomain
  );
  const goalQueries = new GoalQueries(goalProjection);
  const goalQueryBus = new SimpleBus<GoalQuery, GoalQueryResult>();
  const goalQueryHandler = new GoalQueryHandler(goalQueries);
  goalQueryBus.register('ListGoals', (query: ListGoalsQuery) =>
    goalQueryHandler.execute(query)
  );
  goalQueryBus.register('GetGoalById', (query: GetGoalByIdQuery) =>
    goalQueryHandler.execute(query)
  );
  goalQueryBus.register('SearchGoals', (query: SearchGoalsQuery) =>
    goalQueryHandler.execute(query)
  );
  const projectProjection = new ProjectProjectionProcessor(
    store,
    projectEventStore,
    crypto,
    keyStore,
    toDomain
  );
  const projectQueries = new ProjectQueries(projectProjection);
  const projectQueryBus = new SimpleBus<ProjectQuery, ProjectQueryResult>();
  const projectQueryHandler = new ProjectQueryHandler(projectQueries);
  projectQueryBus.register('ListProjects', (query: ListProjectsQuery) =>
    projectQueryHandler.execute(query)
  );
  projectQueryBus.register('GetProjectById', (query: GetProjectByIdQuery) =>
    projectQueryHandler.execute(query)
  );
  projectQueryBus.register('SearchProjects', (query: SearchProjectsQuery) =>
    projectQueryHandler.execute(query)
  );

  return {
    crypto,
    keyStore,
    store,
    goalEventStore,
    projectEventStore,
    eventBus,
    goalRepo,
    projectRepo,
    goalCommandBus,
    projectCommandBus,
    goalQueryBus,
    projectQueryBus,
    goalQueries,
    projectQueries,
    goalProjection,
    projectProjection,
  };
};
