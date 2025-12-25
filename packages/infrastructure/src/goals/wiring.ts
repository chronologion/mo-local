import {
  ArchiveGoal,
  ChangeGoalPriority,
  ChangeGoalSlice,
  ChangeGoalSummary,
  ChangeGoalTargetMonth,
  CreateGoal,
  AchieveGoal,
  UnachieveGoal,
  GetGoalByIdQuery,
  GoalCommand,
  GoalCommandHandler,
  GoalCommandResult,
  GoalQuery,
  GoalQueryHandler,
  GoalQueryResult,
  GrantGoalAccess,
  ListGoalsQuery,
  RevokeGoalAccess,
  SearchGoalsQuery,
  CommandResult,
  ValidationException,
  failure,
  IKeyStore,
} from '@mo/application';
import type { Store } from '@livestore/livestore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { GoalRepository } from './GoalRepository';
import { GoalProjectionProcessor } from './projections/runtime/GoalProjectionProcessor';
import { GoalReadModel } from './GoalReadModel';
import type { BrowserLiveStoreEventStore } from '../browser/LiveStoreEventStore';
import type { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { SimpleBus } from '../bus/SimpleBus';
import { LiveStoreIdempotencyStore } from '../idempotency';

export type GoalBoundedContextServices = {
  goalRepo: GoalRepository;
  goalProjection: GoalProjectionProcessor;
  goalReadModel: GoalReadModel;
  goalCommandBus: SimpleBus<GoalCommand, CommandResult<GoalCommandResult>>;
  goalQueryBus: SimpleBus<GoalQuery, GoalQueryResult>;
};

export type GoalBootstrapDeps = {
  store: Store;
  eventStore: BrowserLiveStoreEventStore;
  crypto: WebCryptoService;
  keyStore: IKeyStore;
  toDomain: LiveStoreToDomainAdapter;
};

const toGoalFailure = (error: unknown): CommandResult<GoalCommandResult> => {
  if (error instanceof ValidationException) {
    return failure(error.details);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return failure([{ field: 'application', message }]);
};

export const bootstrapGoalBoundedContext = ({
  store,
  eventStore,
  crypto,
  keyStore,
  toDomain,
}: GoalBootstrapDeps): GoalBoundedContextServices => {
  const goalRepo = new GoalRepository(
    eventStore,
    store,
    crypto,
    async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
  );
  const idempotencyStore = new LiveStoreIdempotencyStore(store);
  const goalHandler = new GoalCommandHandler(
    goalRepo,
    keyStore,
    crypto,
    idempotencyStore
  );
  const goalProjection = new GoalProjectionProcessor(
    store,
    eventStore,
    crypto,
    keyStore,
    toDomain
  );
  const goalReadModel = new GoalReadModel(goalProjection);
  const goalCommandBus = buildGoalCommandBus(goalHandler);
  const goalQueryBus = buildGoalQueryBus(goalReadModel);

  return {
    goalRepo,
    goalProjection,
    goalReadModel,
    goalCommandBus,
    goalQueryBus,
  };
};

const buildGoalCommandBus = (
  handler: GoalCommandHandler
): SimpleBus<GoalCommand, CommandResult<GoalCommandResult>> => {
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
    wrapGoal(handler.handleCreate.bind(handler), command)
  );
  goalCommandBus.register('ChangeGoalSummary', (command: ChangeGoalSummary) =>
    wrapGoal(handler.handleChangeSummary.bind(handler), command)
  );
  goalCommandBus.register('ChangeGoalSlice', (command: ChangeGoalSlice) =>
    wrapGoal(handler.handleChangeSlice.bind(handler), command)
  );
  goalCommandBus.register(
    'ChangeGoalTargetMonth',
    (command: ChangeGoalTargetMonth) =>
      wrapGoal(handler.handleChangeTargetMonth.bind(handler), command)
  );
  goalCommandBus.register('ChangeGoalPriority', (command: ChangeGoalPriority) =>
    wrapGoal(handler.handleChangePriority.bind(handler), command)
  );
  goalCommandBus.register('ArchiveGoal', (command: ArchiveGoal) =>
    wrapGoal(handler.handleArchive.bind(handler), command)
  );
  goalCommandBus.register('AchieveGoal', (command: AchieveGoal) =>
    wrapGoal(handler.handleAchieve.bind(handler), command)
  );
  goalCommandBus.register('UnachieveGoal', (command: UnachieveGoal) =>
    wrapGoal(handler.handleUnachieve.bind(handler), command)
  );
  goalCommandBus.register('GrantGoalAccess', (command: GrantGoalAccess) =>
    wrapGoal(handler.handleGrantAccess.bind(handler), command)
  );
  goalCommandBus.register('RevokeGoalAccess', (command: RevokeGoalAccess) =>
    wrapGoal(handler.handleRevokeAccess.bind(handler), command)
  );

  return goalCommandBus;
};

const buildGoalQueryBus = (
  readModel: GoalReadModel
): SimpleBus<GoalQuery, GoalQueryResult> => {
  const goalQueryBus = new SimpleBus<GoalQuery, GoalQueryResult>();
  const goalQueryHandler = new GoalQueryHandler(readModel);
  goalQueryBus.register('ListGoals', (query: ListGoalsQuery) =>
    goalQueryHandler.execute(query)
  );
  goalQueryBus.register('GetGoalById', (query: GetGoalByIdQuery) =>
    goalQueryHandler.execute(query)
  );
  goalQueryBus.register('SearchGoals', (query: SearchGoalsQuery) =>
    goalQueryHandler.execute(query)
  );
  return goalQueryBus;
};
