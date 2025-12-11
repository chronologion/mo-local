import {
  createStorePromise,
  type Store,
  type Adapter,
} from '@livestore/livestore';
import {
  GoalCommandHandler,
  ProjectCommandHandler,
  IEventBus,
  SimpleBus,
  registerGoalCommandHandlers,
  registerProjectCommandHandlers,
  GoalCommand,
  GoalCommandResult,
  ProjectCommand,
  ProjectCommandResult,
  CommandResult,
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
import type { GoalListItem } from '../goals/GoalProjectionState';
import {
  type GoalQuery,
  registerGoalQueryHandlers,
} from '../goals/GoalQueryBus';
import { ProjectRepository } from '../projects/ProjectRepository';
import { ProjectQueries } from '../projects/ProjectQueries';
import { ProjectProjectionProcessor } from '../projects/projection/ProjectProjectionProcessor';
import type { ProjectListItem } from '../projects/ProjectProjectionState';
import {
  type ProjectQuery,
  registerProjectQueryHandlers,
} from '../projects/ProjectQueryBus';

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
  goalQueryBus: SimpleBus<GoalQuery, GoalListItem[] | GoalListItem | null>;
  projectQueryBus: SimpleBus<
    ProjectQuery,
    ProjectListItem[] | ProjectListItem | null
  >;
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
  registerGoalCommandHandlers(goalCommandBus, goalHandler);
  const projectCommandBus = new SimpleBus<
    ProjectCommand,
    CommandResult<ProjectCommandResult>
  >();
  registerProjectCommandHandlers(projectCommandBus, projectHandler);
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const goalProjection = new GoalProjectionProcessor(
    store,
    goalEventStore,
    crypto,
    keyStore,
    toDomain
  );
  const goalQueries = new GoalQueries(goalProjection);
  const goalQueryBus = new SimpleBus<
    import('../goals/GoalQueryBus').GoalQuery,
    GoalListItem[] | GoalListItem | null
  >();
  registerGoalQueryHandlers(goalQueryBus, goalQueries);
  const projectProjection = new ProjectProjectionProcessor(
    store,
    projectEventStore,
    crypto,
    keyStore,
    toDomain
  );
  const projectQueries = new ProjectQueries(projectProjection);
  const projectQueryBus = new SimpleBus<
    import('../projects/ProjectQueryBus').ProjectQuery,
    ProjectListItem[] | ProjectListItem | null
  >();
  registerProjectQueryHandlers(projectQueryBus, projectQueries);

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
