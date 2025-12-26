import { type Adapter } from '@livestore/livestore';
import { InMemoryEventBus } from '@mo/infrastructure/events/InMemoryEventBus';
import { CommittedEventPublisher } from '@mo/infrastructure';
import { GoalAchievementSaga, type ValidationError } from '@mo/application';
import {
  IndexedDBKeyStore,
  InMemoryKeyringStore,
  KeyringManager,
  WebCryptoService,
} from '@mo/infrastructure';
import { LiveStoreToDomainAdapter } from '@mo/infrastructure/livestore/adapters/LiveStoreToDomainAdapter';
import { createStoreAndEventStores } from '@mo/infrastructure/browser/wiring/store';
import {
  bootstrapGoalBoundedContext,
  type GoalBoundedContextServices,
} from '@mo/infrastructure/goals';
import {
  bootstrapProjectBoundedContext,
  type ProjectBoundedContextServices,
} from '@mo/infrastructure/projects';
import { GoalAchievementSagaStore } from '@mo/infrastructure/sagas/GoalAchievementSagaStore';

export type AppBoundedContext = 'goals' | 'projects';

export type AppServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  eventBus: InMemoryEventBus;
  publisher: CommittedEventPublisher;
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
  sagas?: {
    goalAchievement?: GoalAchievementSaga;
  };
};

export type CreateAppServicesOptions = {
  adapter: Adapter;
  storeId: string;
  contexts?: AppBoundedContext[];
};

type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

const assertOpfsAvailable = async (): Promise<void> => {
  if (typeof navigator === 'undefined') return;

  const storage = navigator.storage as OpfsStorageManager | undefined;
  if (!storage?.getDirectory) {
    throw new Error(
      'LiveStore persistence requires OPFS (StorageManager.getDirectory), which is not available in this browser context.'
    );
  }

  try {
    await storage.getDirectory();
  } catch {
    // Safari Private Browsing can expose `navigator.storage` but deny OPFS access at runtime.
    throw new Error(
      'LiveStore persistence (OPFS) is not available (Safari Private Browsing is a common cause). Please use a non-private window.'
    );
  }
};

/**
 * Application-level composition root for the web app. Infra exposes BC bootstraps,
 * and the app decides which contexts to start.
 */
export const createAppServices = async ({
  adapter,
  storeId,
  contexts = ['goals', 'projects'],
}: CreateAppServicesOptions): Promise<AppServices> => {
  if (!storeId) {
    throw new Error('storeId is required');
  }
  await assertOpfsAvailable();
  const crypto = new WebCryptoService();
  const keyStore = new IndexedDBKeyStore();
  const keyringStore = new InMemoryKeyringStore();
  const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
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
      keyringManager,
      toDomain,
    });
  }
  if (contexts.includes('projects')) {
    ctx.projects = bootstrapProjectBoundedContext({
      store: storeBundle.store,
      eventStore: storeBundle.projectEventStore,
      crypto,
      keyStore,
      keyringManager,
      toDomain,
    });
  }

  const sagas: AppServices['sagas'] = {};
  if (ctx.goals && ctx.projects) {
    const sagaStore = new GoalAchievementSagaStore(storeBundle.store);
    const saga = new GoalAchievementSaga(
      sagaStore,
      ctx.goals.goalRepo,
      ctx.projects.projectReadModel,
      async (command) => {
        const result = await ctx.goals!.goalCommandBus.dispatch(command);
        if (!result.ok) {
          throw new Error(
            `Goal achievement saga failed: ${result.errors
              .map((e: ValidationError) => `${e.field}:${e.message}`)
              .join(', ')}`
          );
        }
      }
    );
    sagas.goalAchievement = saga;
  }

  const publisher = new CommittedEventPublisher(
    storeBundle.store,
    eventBus,
    toDomain,
    keyringManager,
    CommittedEventPublisher.buildStreams({
      goalEventStore: contexts.includes('goals')
        ? storeBundle.goalEventStore
        : undefined,
      projectEventStore: contexts.includes('projects')
        ? storeBundle.projectEventStore
        : undefined,
    })
  );

  return {
    crypto,
    keyStore,
    eventBus,
    publisher,
    storeId,
    store: storeBundle.store,
    goalEventStore: storeBundle.goalEventStore,
    projectEventStore: storeBundle.projectEventStore,
    contexts: ctx,
    sagas,
  };
};
