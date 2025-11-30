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
import { schema, tables } from '../livestore/schema';
import { LiveStoreEventStore } from '../services/LiveStoreEventStore';

const USER_META_KEY = 'mo-local-user';

type UserMeta = {
  userId: string;
  pwdSalt: string;
};

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'locked'; userId: string }
  | {
      status: 'ready';
      userId: string;
    };

type Services = {
  crypto: WebCryptoService;
  keyStore: IKeyStore;
  store: Store;
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
  unlock: (params: { password: string }) => Promise<void>;
  masterKey: Uint8Array | null;
  restoreBackup: (params: {
    password: string;
    backup: string;
  }) => Promise<void>;
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
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    storeId: string;
    opfsAvailable: boolean;
    storage: string;
    note?: string;
    eventCount?: number;
    aggregateCount?: number;
    tables?: string[];
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

        const updateDebug = () => {
          const tables = (() => {
            try {
              const res = store.query<{ name: string }[]>({
                query: "SELECT name FROM sqlite_master WHERE type = 'table'",
                bindValues: [],
              });
              return res.map((row) => row.name);
            } catch {
              return [];
            }
          })();
          const eventCount = (() => {
            try {
              const res = store.query<{ count: number }[]>({
                query: 'SELECT COUNT(*) as count FROM goal_events',
                bindValues: [],
              });
              return Number(res?.[0]?.count ?? 0);
            } catch {
              return 0;
            }
          })();
          const aggregateCount = (() => {
            try {
              const res = store.query<{ count: number }[]>({
                query:
                  'SELECT COUNT(DISTINCT aggregate_id) as count FROM goal_events',
                bindValues: [],
              });
              return Number(res?.[0]?.count ?? 0);
            } catch {
              return 0;
            }
          })();

          setDebugInfo({
            storeId: store.storeId,
            opfsAvailable:
              typeof navigator !== 'undefined' &&
              !!navigator.storage &&
              typeof navigator.storage.getDirectory === 'function',
            storage: 'opfs',
            note: 'LiveStore adapter (opfs)',
            eventCount,
            aggregateCount,
            tables,
          });
        };

        // Subscribe to LiveStore commits to refresh debug stats
        const unsubscribe = store.subscribe(tables.goal_events.count(), () =>
          updateDebug()
        );

        // Prime initial state
        updateDebug();

        if (!cancelled) {
          setServices({
            crypto,
            keyStore,
            store,
            eventStore,
            eventBus,
            goalRepo,
            goalService,
            goalQueries,
          });
        }

        return () => {
          unsubscribe?.();
        };
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
      if (!cancelled) setSession({ status: 'locked', userId: meta.userId });
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

    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    setMasterKey(kek);

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
  const unlock = async ({ password }: { password: string }) => {
    if (!services) throw new Error('Services not initialized');
    const meta = loadMeta();
    if (!meta) throw new Error('No user metadata found');
    const salt = Uint8Array.from(atob(meta.pwdSalt), (c) => c.charCodeAt(0));
    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    const keys = await services.keyStore.getIdentityKeys(meta.userId);
    if (!keys) {
      throw new Error('No keys found, please re-onboard');
    }
    setMasterKey(kek);
    setSession({ status: 'ready', userId: meta.userId });
  };

  const restoreBackup = async ({
    password,
    backup,
  }: {
    password: string;
    backup: string;
  }) => {
    if (!services) throw new Error('Services not initialized');
    const parsed = JSON.parse(backup) as { cipher: string; salt?: string };
    if (!parsed.cipher || !parsed.salt) {
      throw new Error('Backup missing cipher or salt');
    }
    const salt = Uint8Array.from(atob(parsed.salt), (c) => c.charCodeAt(0));
    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    const encrypted = Uint8Array.from(atob(parsed.cipher), (c) =>
      c.charCodeAt(0)
    );
    const decrypted = await services.crypto.decrypt(encrypted, kek);
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
      userId: string;
      identityKeys: {
        signingPrivateKey: string;
        signingPublicKey: string;
        encryptionPrivateKey: string;
        encryptionPublicKey: string;
      } | null;
      aggregateKeys: Record<string, string>;
    };

    await services.keyStore.clearAll();
    if (payload.identityKeys) {
      await services.keyStore.saveIdentityKeys(payload.userId, {
        signingPrivateKey: Uint8Array.from(
          atob(payload.identityKeys.signingPrivateKey),
          (c) => c.charCodeAt(0)
        ),
        signingPublicKey: Uint8Array.from(
          atob(payload.identityKeys.signingPublicKey),
          (c) => c.charCodeAt(0)
        ),
        encryptionPrivateKey: Uint8Array.from(
          atob(payload.identityKeys.encryptionPrivateKey),
          (c) => c.charCodeAt(0)
        ),
        encryptionPublicKey: Uint8Array.from(
          atob(payload.identityKeys.encryptionPublicKey),
          (c) => c.charCodeAt(0)
        ),
      });
    }
    const aggregateEntries = Object.entries(payload.aggregateKeys);
    for (const [aggregateId, keyB64] of aggregateEntries) {
      await services.keyStore.saveAggregateKey(
        aggregateId,
        Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
      );
    }

    saveMeta({
      userId: payload.userId,
      pwdSalt: parsed.salt,
    });
    setMasterKey(kek);
    setSession({ status: 'ready', userId: payload.userId });
  };

  if (initError) {
    return <div>Failed to initialize LiveStore: {initError}</div>;
  }

  if (!services) {
    return <div>Loading app...</div>;
  }

  return (
    <>
      <AppContext.Provider
        value={{
          services,
          session,
          completeOnboarding,
          unlock,
          masterKey,
          restoreBackup,
        }}
      >
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
            tables: debugInfo.tables ?? [],
            note: debugInfo.note,
            storeId: debugInfo.storeId,
            storage: debugInfo.storage,
            eventCount: debugInfo.eventCount,
            aggregateCount: debugInfo.aggregateCount,
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
