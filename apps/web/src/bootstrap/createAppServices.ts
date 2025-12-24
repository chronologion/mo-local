import { type Adapter } from '@livestore/livestore';
import { InMemoryEventBus } from '@mo/infrastructure/events/InMemoryEventBus';
import { CommittedEventPublisher } from '@mo/infrastructure';
import { GoalAchievementSaga } from '@mo/application';
import { IndexedDBKeyStore } from '@mo/infrastructure/crypto/IndexedDBKeyStore';
import { WebCryptoService } from '@mo/infrastructure/crypto/WebCryptoService';
import { LiveStoreToDomainAdapter } from '@mo/infrastructure/livestore/adapters/LiveStoreToDomainAdapter';
import { createStoreAndEventStores } from '@mo/infrastructure/browser/wiring/store';
import {
  bootstrapGoalBoundedContext,
  type GoalBoundedContextServices,
} from '@mo/infrastructure/goals/wiring';
import {
  bootstrapProjectBoundedContext,
  type ProjectBoundedContextServices,
} from '@mo/infrastructure/projects/wiring';
import { GoalAchievementSagaStore } from '@mo/infrastructure/sagas/GoalAchievementSagaStore';

export type AppBoundedContext = 'goals' | 'projects';

export type AppServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  eventBus: InMemoryEventBus;
  storeId: string;
  store: Awaited<ReturnType<typeof createStoreAndEventStores>>['store'];
  goalEventStore?: Awaited<
    ReturnType<typeof createStoreAndEventStores>
  >['goalEventStore'];
  projectEventStore?: Awaited<
    ReturnType<typeof createStoreAndEventStores>
  >['projectEventStore'];
  contexts: {
    goals?: GoalBoundedContextServices;
    projects?: ProjectBoundedContextServices;
  };
};

export type CreateAppServicesOptions = {
  adapter: Adapter;
  storeId?: string;
  contexts?: AppBoundedContext[];
};

/**
 * Application-level composition root for the web app. Infra exposes BC bootstraps,
 * and the app decides which contexts to start.
 */
export const createAppServices = async ({
  adapter,
  storeId = 'mo-local-v2',
  contexts = ['goals', 'projects'],
}: CreateAppServicesOptions): Promise<AppServices> => {
  const crypto = new WebCryptoService();
  const keyStore = new IndexedDBKeyStore();
  const eventBus = new InMemoryEventBus();
  const toDomain = new LiveStoreToDomainAdapter(crypto);
  const apiBaseUrl =
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_API_BASE_URL ??
    'http://localhost:4000';

  const storeBundle = await createStoreAndEventStores(adapter, storeId, {
    syncPayload: { apiBaseUrl },
  });

  const ctx: AppServices['contexts'] = {};
  if (contexts.includes('goals')) {
    ctx.goals = bootstrapGoalBoundedContext({
      store: storeBundle.store,
      eventStore: storeBundle.goalEventStore,
      crypto,
      keyStore,
      toDomain,
    });
  }
  if (contexts.includes('projects')) {
    ctx.projects = bootstrapProjectBoundedContext({
      store: storeBundle.store,
      eventStore: storeBundle.projectEventStore,
      crypto,
      keyStore,
      toDomain,
    });
  }

  if (ctx.goals && ctx.projects) {
    const sagaStore = new GoalAchievementSagaStore(storeBundle.store);
    const saga = new GoalAchievementSaga(
      sagaStore,
      ctx.goals.goalReadModel,
      async (command) => {
        const result = await ctx.goals!.goalCommandBus.dispatch(command);
        if (!result.ok) {
          throw new Error(
            `Goal achievement saga failed: ${result.errors
              .map((e) => `${e.field}:${e.message}`)
              .join(', ')}`
          );
        }
      }
    );
    saga.subscribe(eventBus);
  }

  const publisher = new CommittedEventPublisher(
    storeBundle.store,
    eventBus,
    toDomain,
    keyStore,
    CommittedEventPublisher.buildStreams({
      goalEventStore: contexts.includes('goals')
        ? storeBundle.goalEventStore
        : undefined,
      projectEventStore: contexts.includes('projects')
        ? storeBundle.projectEventStore
        : undefined,
    })
  );
  await publisher.start();

  return {
    crypto,
    keyStore,
    eventBus,
    storeId,
    store: storeBundle.store,
    goalEventStore: storeBundle.goalEventStore,
    projectEventStore: storeBundle.projectEventStore,
    contexts: ctx,
  };
};
