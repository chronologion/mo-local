import { createContext, useContext, useEffect, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import {
  GoalApplicationService,
  GoalCommandHandler,
  IEventBus,
  IKeyStore,
} from '@mo/application';
import {
  IndexedDBKeyStore,
  LiveStoreToDomainAdapter,
  WebCryptoService,
} from '@mo/infrastructure/browser';
import { InMemoryEventBus } from '@mo/application';
import { GoalQueries } from '../services/GoalQueries';
import { GoalRepository } from '../services/GoalRepository';
import { DebugPanel } from '../components/DebugPanel';
import { createStorePromise, type Store } from '@livestore/livestore';
import { adapter } from './LiveStoreAdapter';
import { schema } from '../livestore/schema';
import { LiveStoreEventStore } from '../services/LiveStoreEventStore';

const USER_META_KEY = 'mo-local-user';

type UserMeta = {
  userId: string;
  pwdSalt: string;
};

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | {
      status: 'ready';
      userId: string;
    };

type Services = {
  crypto: WebCryptoService;
  keyStore: IKeyStore;
  eventStore: LiveStoreEventStore;
  eventBus: IEventBus;
  goalRepo: GoalRepository;
  goalService: GoalApplicationService;
  goalQueries: GoalQueries;
};

type AppContextValue = {
  services: Services;
  session: SessionState;
  completeOnboarding: (params: { password: string }) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const loadMeta = (): UserMeta | null => {
  const raw = localStorage.getItem(USER_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserMeta;
  } catch {
    return null;
  }
};

const saveMeta = (meta: UserMeta): void => {
  localStorage.setItem(USER_META_KEY, JSON.stringify(meta));
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [services, setServices] = useState<Services | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    storeId: string;
    opfsAvailable: boolean;
    note?: string;
  } | null>(null);

  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const crypto = new WebCryptoService();
        const keyStore = new IndexedDBKeyStore();
        const store = (await createStorePromise({
          schema,
          adapter,
          storeId: 'mo-local',
        })) as unknown as Store;
        const eventStore = new LiveStoreEventStore(store);
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

        if (!cancelled) {
          setServices({
            crypto,
            keyStore,
            eventStore,
            eventBus,
            goalRepo,
            goalService,
            goalQueries,
          });
          setDebugInfo({
            storeId: store.storeId,
            opfsAvailable:
              typeof navigator !== 'undefined' &&
              !!navigator.storage &&
              typeof navigator.storage.getDirectory === 'function',
            note: 'LiveStore adapter (opfs)',
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to initialize app';
        if (!cancelled) {
          setInitError(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    (async () => {
      const meta = loadMeta();
      if (!meta) {
        if (!cancelled) setSession({ status: 'needs-onboarding' });
        return;
      }
      const keys = await services.keyStore.getIdentityKeys(meta.userId);
      if (!keys) {
        if (!cancelled) setSession({ status: 'needs-onboarding' });
        return;
      }
      if (!cancelled) {
        setSession({ status: 'ready', userId: meta.userId });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services]);

  const completeOnboarding = async ({ password }: { password: string }) => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    const userId = uuidv7();
    const salt =
      globalThis.crypto?.getRandomValues(new Uint8Array(16)) ||
      new Uint8Array(16).map(() => Math.floor(Math.random() * 256));

    // Derive K_pwd (not yet used in UI flows, but computed for parity with PRD)
    await services.crypto.deriveKeyFromPassword(password, salt);

    const signing = await services.crypto.generateSigningKeyPair();
    const encryption = await services.crypto.generateEncryptionKeyPair();

    await services.keyStore.saveIdentityKeys(userId, {
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
      encryptionPrivateKey: encryption.privateKey,
      encryptionPublicKey: encryption.publicKey,
    });

    saveMeta({ userId, pwdSalt: btoa(String.fromCharCode(...salt)) });
    setSession({ status: 'ready', userId });
  };

  if (initError) {
    return <div>Failed to initialize LiveStore: {initError}</div>;
  }

  if (!services) {
    return <div>Loading app...</div>;
  }

  return (
    <>
      <AppContext.Provider value={{ services, session, completeOnboarding }}>
        {children}
      </AppContext.Provider>
      {debugInfo ? (
        <DebugPanel
          info={{
            vfsName: 'adapter-web',
            opfsAvailable: debugInfo.opfsAvailable,
            syncAccessHandle:
              typeof (
                globalThis as {
                  FileSystemSyncAccessHandle?: unknown;
                }
              ).FileSystemSyncAccessHandle !== 'undefined',
            tables: [],
            note: debugInfo.note,
          }}
        />
      ) : null}
    </>
  );
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider missing');
  return ctx;
};
