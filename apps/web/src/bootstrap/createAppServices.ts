import { InMemoryEventBus } from '@mo/infrastructure/events/InMemoryEventBus';
import { CommittedEventPublisher } from '@mo/infrastructure';
import {
  ConcurrencyError,
  GoalAchievementSaga,
  type ValidationError,
} from '@mo/application';
import {
  IndexedDBKeyStore,
  InMemoryKeyringStore,
  KeyringManager,
  WebCryptoService,
} from '@mo/infrastructure';
import {
  EncryptedEventToDomainAdapter,
  SqliteEventStore,
} from '@mo/infrastructure';
import {
  bootstrapGoalBoundedContext,
  type GoalBoundedContextServices,
} from '@mo/infrastructure/goals';
import {
  bootstrapProjectBoundedContext,
  type ProjectBoundedContextServices,
} from '@mo/infrastructure/projects';
import {
  SqliteGoalAchievementSagaStore,
  ProcessManagerStateStore,
} from '@mo/infrastructure';
import { createWebSqliteDb, type SqliteDbPort } from '@mo/eventstore-web';
import { SyncEngine, HttpSyncTransport } from '@mo/sync-engine';
import { AggregateTypes } from '@mo/eventstore-core';
import { MissingKeyError } from '@mo/infrastructure';
import { DomainEvent } from '@mo/domain';
import { PendingEventVersionRewriter } from '@mo/infrastructure';

export type AppBoundedContext = 'goals' | 'projects';

export type AppServices = {
  crypto: WebCryptoService;
  keyStore: IndexedDBKeyStore;
  eventBus: InMemoryEventBus;
  publisher: CommittedEventPublisher;
  storeId: string;
  db: SqliteDbPort;
  dbShutdown: () => Promise<void>;
  syncEngine: SyncEngine;
  contexts: {
    goals?: GoalBoundedContextServices;
    projects?: ProjectBoundedContextServices;
  };
  sagas?: {
    goalAchievement?: GoalAchievementSaga;
  };
};

export type CreateAppServicesOptions = {
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
      'Event store persistence requires OPFS (StorageManager.getDirectory), which is not available in this browser context.'
    );
  }

  try {
    await storage.getDirectory();
  } catch {
    // Safari Private Browsing can expose `navigator.storage` but deny OPFS access at runtime.
    throw new Error(
      'Event store persistence (OPFS) is not available (Safari Private Browsing is a common cause). Please use a non-private window.'
    );
  }
};

/**
 * Application-level composition root for the web app. Infra exposes BC bootstraps,
 * and the app decides which contexts to start.
 */
export const createAppServices = async ({
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
  const toDomain = new EncryptedEventToDomainAdapter(crypto);
  const apiBaseUrl =
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_API_BASE_URL ??
    'http://localhost:4000';

  const { db, shutdown } = await createWebSqliteDb({
    storeId,
    dbName: `mo-eventstore-${storeId}.db`,
    requireOpfs: true,
  });

  const ctx: AppServices['contexts'] = {};
  if (contexts.includes('goals')) {
    ctx.goals = bootstrapGoalBoundedContext({
      db,
      crypto,
      keyStore,
      keyringManager,
      toDomain,
    });
  }
  if (contexts.includes('projects')) {
    ctx.projects = bootstrapProjectBoundedContext({
      db,
      crypto,
      keyStore,
      keyringManager,
      toDomain,
    });
  }

  const sagas: AppServices['sagas'] = {};
  if (ctx.goals && ctx.projects) {
    const seedEvents = async (): Promise<DomainEvent[]> => {
      const goalStore = new SqliteEventStore(db, AggregateTypes.goal);
      const projectStore = new SqliteEventStore(db, AggregateTypes.project);
      const [goalEvents, projectEvents] = await Promise.all([
        goalStore.getAllEvents(),
        projectStore.getAllEvents(),
      ]);
      const allEvents = [...goalEvents, ...projectEvents]
        .filter((event) => event.sequence !== undefined)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

      const domainEvents: DomainEvent[] = [];
      for (const event of allEvents) {
        try {
          const kAggregate = await keyringManager.resolveKeyForEvent(event);
          const domainEvent = await toDomain.toDomain(event, kAggregate);
          domainEvents.push(domainEvent);
        } catch (error) {
          if (error instanceof MissingKeyError) {
            console.warn(
              '[GoalAchievementSaga] Missing key for seed event',
              event.aggregateId
            );
            continue;
          }
          if (
            error instanceof Error &&
            error.message === 'Master key not set'
          ) {
            console.warn(
              '[GoalAchievementSaga] Master key not set; skipping seed'
            );
            return [];
          }
          throw error;
        }
      }

      return domainEvents;
    };
    const sagaStore = new SqliteGoalAchievementSagaStore(
      new ProcessManagerStateStore(db),
      crypto,
      keyStore
    );
    const isConcurrencyFailure = (errors: ValidationError[]): boolean =>
      errors.some(
        (error) =>
          error.field === 'application' &&
          error.message.includes('version mismatch')
      );

    const saga = new GoalAchievementSaga(
      sagaStore,
      seedEvents,
      async (command) => {
        const result = await ctx.goals!.goalCommandBus.dispatch(command);
        if (!result.ok) {
          if (isConcurrencyFailure(result.errors)) {
            throw new ConcurrencyError('Goal version mismatch');
          }
          throw new Error(
            `Goal achievement saga failed: ${result.errors
              .map((e: ValidationError) => `${e.field}:${e.message}`)
              .join(', ')}`
          );
        }
      },
      async (command) => {
        const result = await ctx.goals!.goalCommandBus.dispatch(command);
        if (!result.ok) {
          if (isConcurrencyFailure(result.errors)) {
            throw new ConcurrencyError('Goal version mismatch');
          }
          throw new Error(
            `Goal unachieve saga failed: ${result.errors
              .map((e: ValidationError) => `${e.field}:${e.message}`)
              .join(', ')}`
          );
        }
      }
    );
    sagas.goalAchievement = saga;
  }

  const publisher = new CommittedEventPublisher(
    db,
    eventBus,
    toDomain,
    keyringManager,
    CommittedEventPublisher.buildStreams({
      db,
      includeGoals: contexts.includes('goals'),
      includeProjects: contexts.includes('projects'),
    })
  );

  const syncEngine = new SyncEngine({
    db,
    storeId,
    transport: new HttpSyncTransport({ baseUrl: apiBaseUrl }),
    pendingVersionRewriter: new PendingEventVersionRewriter(
      db,
      crypto,
      keyringManager
    ),
    onRebaseRequired: async () => {
      // Rebuild projections first so saga reconciliation reads consistent views.
      await Promise.all([
        ctx.goals?.goalProjection.onRebaseRequired(),
        ctx.projects?.projectProjection.onRebaseRequired(),
      ]);
      await sagas.goalAchievement?.onRebaseRequired();
    },
  });

  return {
    crypto,
    keyStore,
    eventBus,
    publisher,
    storeId,
    db,
    dbShutdown: shutdown,
    syncEngine,
    contexts: ctx,
    sagas,
  };
};
