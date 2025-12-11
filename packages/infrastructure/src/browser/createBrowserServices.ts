import { type Adapter } from '@livestore/livestore';
import { InMemoryEventBus } from '../events/InMemoryEventBus';
import { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { createStoreAndEventStores } from './wiring/store';
import {
  bootstrapGoalBoundedContext,
  type GoalBoundedContextServices,
} from '../goals/wiring';
import {
  bootstrapProjectBoundedContext,
  type ProjectBoundedContextServices,
} from '../projects/wiring';
import type { BrowserLiveStoreEventStore } from './LiveStoreEventStore';
import type { Store } from '@livestore/livestore';

export type BrowserBoundedContext = 'goals' | 'projects';

export type BrowserServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  eventBus: InMemoryEventBus;
  store: Store;
  goalEventStore?: BrowserLiveStoreEventStore;
  projectEventStore?: BrowserLiveStoreEventStore;
  contexts: {
    goals?: GoalBoundedContextServices;
    projects?: ProjectBoundedContextServices;
  };
  storeId: string;
};

export type BrowserServicesOptions = {
  adapter: Adapter;
  storeId?: string;
  contexts?: BrowserBoundedContext[];
};

/**
 * Bootstrap selected bounded contexts for the browser runtime.
 * The interface layer chooses which BCs to start.
 */
export const createBrowserServices = async ({
  adapter,
  storeId = 'mo-local-v2',
  contexts = ['goals', 'projects'],
}: BrowserServicesOptions): Promise<BrowserServices> => {
  const crypto = new WebCryptoService();
  const keyStore = new IndexedDBKeyStore();
  const eventBus = new InMemoryEventBus();
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const storeBundle = await createStoreAndEventStores(adapter, storeId);

  const ctx: BrowserServices['contexts'] = {};
  if (contexts.includes('goals')) {
    ctx.goals = bootstrapGoalBoundedContext({
      store: storeBundle.store,
      eventStore: storeBundle.goalEventStore,
      crypto,
      keyStore,
      eventBus,
      toDomain,
    });
  }
  if (contexts.includes('projects')) {
    ctx.projects = bootstrapProjectBoundedContext({
      store: storeBundle.store,
      eventStore: storeBundle.projectEventStore,
      crypto,
      keyStore,
      eventBus,
      toDomain,
    });
  }

  return {
    crypto,
    keyStore,
    eventBus,
    contexts: ctx,
    storeId,
    store: storeBundle.store,
    goalEventStore: storeBundle.goalEventStore,
    projectEventStore: storeBundle.projectEventStore,
  };
};
