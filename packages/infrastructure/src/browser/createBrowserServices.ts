import {
  createStorePromise,
  type Store,
  type Adapter,
} from '@livestore/livestore';
import {
  GoalApplicationService,
  GoalCommandHandler,
  IEventBus,
  SimpleBus,
  registerGoalCommandHandlers,
} from '@mo/application';
import { InMemoryEventBus } from '@mo/application';
import { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { BrowserLiveStoreEventStore } from './LiveStoreEventStore';
import { GoalRepository } from './GoalRepository';
import { GoalQueries } from './GoalQueries';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { schema as defaultSchema, events as goalEvents } from './schema';
import { GoalProjectionProcessor } from './projection/GoalProjectionProcessor';
import type { GoalListItem } from './GoalProjectionState';
import {
  type GoalQuery,
  registerGoalQueryHandlers,
} from './GoalQueryBus';

export type BrowserServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  store: Store;
  eventStore: BrowserLiveStoreEventStore;
  eventBus: IEventBus;
  goalRepo: GoalRepository;
  goalCommandBus: SimpleBus<
    { type: string },
    Awaited<ReturnType<GoalApplicationService['handle']>>
  >;
  goalQueryBus: SimpleBus<GoalQuery, GoalListItem[] | GoalListItem | null>;
  goalQueries: GoalQueries;
  goalProjection: GoalProjectionProcessor;
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
  const eventStore = new BrowserLiveStoreEventStore(
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
  const eventBus = new InMemoryEventBus();
  const goalRepo = new GoalRepository(
    eventStore,
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
  const goalService = new GoalApplicationService(goalHandler);
  const goalCommandBus = new SimpleBus<
    { type: string },
    Awaited<ReturnType<GoalApplicationService['handle']>>
  >();
  registerGoalCommandHandlers(goalCommandBus, goalHandler);
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const goalProjection = new GoalProjectionProcessor(
    store,
    eventStore,
    crypto,
    keyStore,
    toDomain
  );
  const goalQueries = new GoalQueries(goalProjection);
  const goalQueryBus = new SimpleBus<
    import('./GoalQueryBus').GoalQuery,
    GoalListItem[] | GoalListItem | null
  >();
  registerGoalQueryHandlers(goalQueryBus, goalQueries);

  return {
    crypto,
    keyStore,
    store,
    eventStore,
    eventBus,
    goalRepo,
    goalCommandBus,
    goalQueryBus,
    goalQueries,
    goalProjection,
  };
};
