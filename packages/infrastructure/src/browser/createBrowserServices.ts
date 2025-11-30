import { createStorePromise, type Store } from '@livestore/livestore';
import {
  GoalApplicationService,
  GoalCommandHandler,
  IEventBus,
} from '@mo/application';
import { InMemoryEventBus } from '@mo/application';
import { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { BrowserLiveStoreEventStore } from './LiveStoreEventStore';
import { GoalRepository } from './GoalRepository';
import { GoalQueries } from './GoalQueries';
import { LiveStoreToDomainAdapter } from '..';

type Adapter = unknown;

export type BrowserServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  store: Store;
  eventStore: BrowserLiveStoreEventStore;
  eventBus: IEventBus;
  goalRepo: GoalRepository;
  goalService: GoalApplicationService;
  goalQueries: GoalQueries;
};

export type BrowserServicesOptions = {
  schema: any;
  adapter: any;
  storeId?: string;
};

/**
 * Factory to construct browser goal services with LiveStore wiring contained in infra.
 * The caller supplies the schema and adapter (e.g., from @livestore/adapter-web).
 */
export const createBrowserServices = async ({
  schema,
  adapter,
  storeId = 'mo-local',
}: BrowserServicesOptions): Promise<BrowserServices> => {
  const crypto = new WebCryptoService();
  const keyStore = new IndexedDBKeyStore();
  const store = (await createStorePromise({
    schema: schema as never,
    adapter: adapter as never,
    storeId,
  })) as unknown as Store;
  const eventStore = new BrowserLiveStoreEventStore(
    store,
    (schema as { events: { goalEvent: (payload: unknown) => unknown } }).events
      .goalEvent as (payload: {
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
  const goalQueries = new GoalQueries(
    eventStore,
    new LiveStoreToDomainAdapter(crypto),
    async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
  );

  return {
    crypto,
    keyStore,
    store,
    eventStore,
    eventBus,
    goalRepo,
    goalService,
    goalQueries,
  };
};
