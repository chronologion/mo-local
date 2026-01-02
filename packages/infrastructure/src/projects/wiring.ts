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
  CommandResult,
  ValidationException,
  failure,
  KeyStorePort,
} from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { AggregateTypes } from '@mo/eventstore-core';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { KeyringManager } from '../crypto/KeyringManager';
import { ProjectRepository } from './ProjectRepository';
import { ProjectProjectionProcessor } from './derived-state/ProjectProjectionProcessor';
import { ProjectReadModel } from './ProjectReadModel';
import { SqliteEventStore } from '../eventstore/SqliteEventStore';
import type { EncryptedEventToDomainAdapter } from '../eventstore/adapters/EncryptedEventToDomainAdapter';
import { SimpleBus } from '../bus/SimpleBus';
import { SqliteIdempotencyStore } from '../idempotency';

export type ProjectBoundedContextServices = {
  projectRepo: ProjectRepository;
  projectProjection: ProjectProjectionProcessor;
  projectReadModel: ProjectReadModel;
  projectCommandBus: SimpleBus<ProjectCommand, CommandResult<ProjectCommandResult>>;
  projectQueryBus: SimpleBus<ProjectQuery, ProjectQueryResult>;
};

export type ProjectBootstrapDeps = {
  db: SqliteDbPort;
  crypto: WebCryptoService;
  keyStore: KeyStorePort;
  keyringManager: KeyringManager;
  toDomain: EncryptedEventToDomainAdapter;
};

const toProjectFailure = (error: unknown): CommandResult<ProjectCommandResult> => {
  if (error instanceof ValidationException) {
    return failure(error.details);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return failure([{ field: 'application', message }]);
};

export const bootstrapProjectBoundedContext = ({
  db,
  crypto,
  keyStore,
  keyringManager,
  toDomain,
}: ProjectBootstrapDeps): ProjectBoundedContextServices => {
  const eventStore = new SqliteEventStore(db, AggregateTypes.project);
  const projectRepo = new ProjectRepository(eventStore, db, crypto, keyStore, keyringManager);
  const idempotencyStore = new SqliteIdempotencyStore(db);
  const projectHandler = new ProjectCommandHandler(projectRepo, keyStore, crypto, idempotencyStore);
  const projectProjection = new ProjectProjectionProcessor(db, crypto, keyStore, keyringManager, toDomain);
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
  const projectCommandBus = new SimpleBus<ProjectCommand, CommandResult<ProjectCommandResult>>();
  const wrapProject = async <TCommand extends ProjectCommand>(
    fn: (command: TCommand) => Promise<ProjectCommandResult>,
    command: TCommand
  ): Promise<CommandResult<ProjectCommandResult>> => {
    try {
      const value = await fn(command);
      return { ok: true, value };
    } catch (error) {
      return toProjectFailure(error);
    }
  };

  projectCommandBus.register('CreateProject', (command: CreateProject) =>
    wrapProject(handler.handleCreate.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectStatus', (command: ChangeProjectStatus) =>
    wrapProject(handler.handleChangeStatus.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectDates', (command: ChangeProjectDates) =>
    wrapProject(handler.handleChangeDates.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectName', (command: ChangeProjectName) =>
    wrapProject(handler.handleChangeName.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectDescription', (command: ChangeProjectDescription) =>
    wrapProject(handler.handleChangeDescription.bind(handler), command)
  );

  projectCommandBus.register('AddProjectGoal', (command: AddProjectGoal) =>
    wrapProject(handler.handleAddGoal.bind(handler), command)
  );

  projectCommandBus.register('RemoveProjectGoal', (command: RemoveProjectGoal) =>
    wrapProject(handler.handleRemoveGoal.bind(handler), command)
  );

  projectCommandBus.register('AddProjectMilestone', (command: AddProjectMilestone) =>
    wrapProject(handler.handleAddMilestone.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectMilestoneTargetDate', (command: ChangeProjectMilestoneTargetDate) =>
    wrapProject(handler.handleChangeMilestoneTargetDate.bind(handler), command)
  );

  projectCommandBus.register('ChangeProjectMilestoneName', (command: ChangeProjectMilestoneName) =>
    wrapProject(handler.handleChangeMilestoneName.bind(handler), command)
  );

  projectCommandBus.register('ArchiveProjectMilestone', (command: ArchiveProjectMilestone) =>
    wrapProject(handler.handleArchiveMilestone.bind(handler), command)
  );

  projectCommandBus.register('ArchiveProject', (command: ArchiveProject) =>
    wrapProject(handler.handleArchive.bind(handler), command)
  );

  return projectCommandBus;
};

const buildProjectQueryBus = (readModel: ProjectReadModel): SimpleBus<ProjectQuery, ProjectQueryResult> => {
  const projectQueryBus = new SimpleBus<ProjectQuery, ProjectQueryResult>();
  const projectQueryHandler = new ProjectQueryHandler(readModel);
  projectQueryBus.register('ListProjects', (query: ListProjectsQuery) => projectQueryHandler.execute(query));
  projectQueryBus.register('GetProjectById', (query: GetProjectByIdQuery) => projectQueryHandler.execute(query));
  projectQueryBus.register('SearchProjects', (query: SearchProjectsQuery) => projectQueryHandler.execute(query));
  return projectQueryBus;
};
