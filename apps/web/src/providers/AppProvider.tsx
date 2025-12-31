import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import { createAppServices } from '../bootstrap/createAppServices';
import { DebugPanel } from '../components/DebugPanel';
import {
  decodeSalt,
  encodeSalt,
  generateRandomSalt,
} from '@mo/infrastructure/crypto/deriveSalt';
import { parseBackupEnvelope } from '@mo/presentation';
import { z } from 'zod';
import {
  InterfaceProvider,
  type InterfaceContextValue,
  type InterfaceServices,
} from '@mo/presentation/react';
import { useRemoteAuth } from './RemoteAuthProvider';
import {
  wipeAllMoLocalOpfs,
  wipeEventStoreDb,
} from '../utils/resetEventStoreDb';
import { parseBackupPayload } from '../backup/backupPayload';
import { Button } from '../components/ui/button';

const USER_META_KEY = 'mo-local-user';
const STORE_ID_KEY = 'mo-local-store-id';

const loadStoredStoreId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORE_ID_KEY);
};

type UserMeta = {
  /**
   * Stable local identity id (UUIDv7). Used for `actorId` and identity key records.
   */
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

type Services = Awaited<ReturnType<typeof createAppServices>>;

type AppContextValue = {
  services: Services;
  userMeta: UserMeta | null;
  session: SessionState;
  completeOnboarding: (params: { password: string }) => Promise<void>;
  unlock: (params: { password: string }) => Promise<void>;
  resetLocalState: () => Promise<void>;
  rebuildProjections: () => Promise<void>;
  masterKey: Uint8Array | null;
  restoreBackup: (params: {
    password: string;
    backup: string;
  }) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const userMetaSchema = z.object({
  userId: z.uuid(),
  pwdSalt: z.string().min(1),
});

const storeIdSchema = z.uuid();

const loadMeta = (): UserMeta | null => {
  const raw = localStorage.getItem(USER_META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const safe = userMetaSchema.safeParse(parsed);
    if (!safe.success) return null;
    return safe.data;
  } catch {
    return null;
  }
};

const saveMeta = (meta: UserMeta): void => {
  localStorage.setItem(USER_META_KEY, JSON.stringify(meta));
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { state: remoteAuthState } = useRemoteAuth();
  const [services, setServices] = useState<Services | null>(null);
  const [servicesConfig, setServicesConfig] = useState<{
    storeId: string;
  } | null>(null);
  const servicesRef = useRef<Services | null>(null);
  const pendingInitResolver = useRef<{
    resolve: (svc: Services) => void;
    reject: (error: unknown) => void;
    targetStoreId: string;
  } | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    storeId: string;
    opfsAvailable: boolean;
    storage: string;
    note?: string;
    eventCount?: number;
    aggregateCount?: number;
    tables?: string[];
    onRebuild?: () => void;
    onDownloadDb?: () => void;
  } | null>(null);

  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const sagaBootstrappedRef = useRef<Set<string>>(new Set());
  const publisherStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const meta = loadMeta();
    const storedStoreId = loadStoredStoreId();
    if (meta) {
      setUserMeta(meta);
      setSession({ status: 'locked', userId: meta.userId });
      const nextStoreId = meta.userId;
      if (
        typeof localStorage !== 'undefined' &&
        storedStoreId !== nextStoreId
      ) {
        localStorage.setItem(STORE_ID_KEY, nextStoreId);
      }
      setStoreId(nextStoreId);
      return;
    }

    setUserMeta(null);
    setSession({ status: 'needs-onboarding' });
    const fallbackStoreId = (() => {
      if (storedStoreId) {
        const parsed = storeIdSchema.safeParse(storedStoreId);
        if (parsed.success) return parsed.data;
      }
      return uuidv7();
    })();
    if (
      typeof localStorage !== 'undefined' &&
      storedStoreId !== fallbackStoreId
    ) {
      localStorage.setItem(STORE_ID_KEY, fallbackStoreId);
    }
    setStoreId(fallbackStoreId);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setServices(null);
    setServicesConfig(null);
    setDebugInfo(null);
    servicesRef.current = null;
    const controller = new AbortController();
    const { signal } = controller;
    let unsubscribe: (() => void) | undefined;
    let intervalId: number | undefined;
    let createdServices: Services | null = null;
    (async () => {
      try {
        setInitError(null);
        const svc = await createAppServices({
          storeId,
          contexts: ['goals', 'projects'],
        });
        const updateDebug = async () => {
          const tablesList = await (async () => {
            try {
              const res = await svc.db.query<Readonly<{ name: string }>>(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
              );
              return res.map((row) => row.name);
            } catch {
              return [];
            }
          })();
          const eventCount = await (async () => {
            try {
              const res = await svc.db.query<Readonly<{ count: number }>>(
                'SELECT COUNT(*) as count FROM events'
              );
              return Number(res?.[0]?.count ?? 0);
            } catch {
              return 0;
            }
          })();
          const aggregateCount = await (async () => {
            try {
              const res = await svc.db.query<Readonly<{ count: number }>>(
                'SELECT COUNT(DISTINCT aggregate_id) as count FROM events'
              );
              return Number(res?.[0]?.count ?? 0);
            } catch {
              return 0;
            }
          })();

          setDebugInfo({
            storeId,
            opfsAvailable:
              typeof navigator !== 'undefined' &&
              !!navigator.storage &&
              typeof navigator.storage.getDirectory === 'function',
            storage: 'opfs',
            note: 'eventstore-web (opfs)',
            eventCount,
            aggregateCount,
            tables: tablesList,
            onRebuild: () => {
              const goalCtx = svc.contexts.goals;
              const projectCtx = svc.contexts.projects;
              if (!goalCtx || !projectCtx) {
                return;
              }
              void (async () => {
                await goalCtx.goalProjection.resetAndRebuild();
                await projectCtx.projectProjection.resetAndRebuild();
              })();
            },
            onDownloadDb: () => {
              if (!svc.db.exportMainDatabase) {
                console.warn('[DebugPanel] DB export not supported by adapter');
                return;
              }
              void (async () => {
                const bytes = await svc.db.exportMainDatabase?.();
                if (!bytes) {
                  console.warn('[DebugPanel] DB export returned no bytes');
                  return;
                }
                const stableBytes = new Uint8Array(bytes);
                const blob = new Blob([stableBytes], {
                  type: 'application/x-sqlite3',
                });
                const url = URL.createObjectURL(blob);
                try {
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `mo-eventstore-${storeId}.db`;
                  a.rel = 'noopener';
                  a.click();
                } finally {
                  URL.revokeObjectURL(url);
                }
              })();
            },
          });
        };

        unsubscribe = svc.db.subscribeToTables(['events'], () => {
          void updateDebug();
        });
        void updateDebug();
        if (import.meta.env.DEV) {
          intervalId = window.setInterval(() => {
            void updateDebug();
          }, 1000);
        }

        if (!signal.aborted) {
          servicesRef.current = svc;
          setServices(svc);
          setServicesConfig({ storeId });
          if (
            pendingInitResolver.current &&
            pendingInitResolver.current.targetStoreId === svc.storeId
          ) {
            pendingInitResolver.current.resolve(svc);
            pendingInitResolver.current = null;
          }
        }
        createdServices = svc;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to initialize app';
        if (!signal.aborted) {
          setInitError(message);
          setServicesConfig(null);
          if (pendingInitResolver.current) {
            pendingInitResolver.current.reject(error);
            pendingInitResolver.current = null;
          }
        }
      }
    })();
    return () => {
      controller.abort();
      unsubscribe?.();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
      try {
        createdServices?.contexts.goals?.goalProjection.stop();
        createdServices?.contexts.projects?.projectProjection.stop();
        createdServices?.publisher.stop();
        createdServices?.syncEngine.stop();
        void createdServices?.dbShutdown();
      } catch (error) {
        console.warn('Failed to shutdown event store cleanly', error);
      }
      if (
        pendingInitResolver.current &&
        pendingInitResolver.current.targetStoreId === storeId
      ) {
        pendingInitResolver.current.reject(
          new Error('Store initialization aborted')
        );
        pendingInitResolver.current = null;
      }
    };
  }, [storeId]);

  const switchToStore = async (targetStoreId: string): Promise<Services> => {
    if (
      servicesRef.current &&
      servicesRef.current.storeId === targetStoreId &&
      services
    ) {
      return servicesRef.current;
    }
    return await new Promise<Services>((resolve, reject) => {
      pendingInitResolver.current = { resolve, reject, targetStoreId };
      setStoreId(targetStoreId);
    });
  };

  useEffect(() => {
    if (!services || session.status !== 'ready' || !masterKey) return;
    let cancelled = false;
    const currentServices = services;
    currentServices.keyStore.setMasterKey(masterKey);
    const goalCtx = currentServices.contexts.goals;
    const projectCtx = currentServices.contexts.projects;
    if (!goalCtx || !projectCtx) return;
    void (async () => {
      try {
        if (servicesRef.current !== currentServices) return;
        if (!publisherStartedRef.current.has(currentServices.storeId)) {
          await currentServices.publisher.start();
          publisherStartedRef.current.add(currentServices.storeId);
        }
        await goalCtx.goalProjection.start();
        await projectCtx.projectProjection.start();
        const saga = currentServices.sagas?.goalAchievement;
        if (saga && !sagaBootstrappedRef.current.has(currentServices.storeId)) {
          saga.subscribe(currentServices.eventBus);
          await saga.bootstrap();
          sagaBootstrappedRef.current.add(currentServices.storeId);
        }
      } catch (error) {
        if (cancelled) return;
        if (servicesRef.current !== currentServices) return;
        if (
          error instanceof Error &&
          error.message.includes('Store has been shut down')
        ) {
          return;
        }
        console.warn('Failed to start projections', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, masterKey, session.status]);

  useEffect(() => {
    if (!services || session.status !== 'ready' || !masterKey) return;
    if (remoteAuthState.status !== 'connected') {
      services.syncEngine.stop();
      return;
    }
    services.syncEngine.start();
    void services.syncEngine.syncOnce().catch(() => undefined);
    return () => {
      services.syncEngine.stop();
    };
  }, [services, masterKey, session.status, remoteAuthState.status]);

  const completeOnboarding = async ({ password }: { password: string }) => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    if (!storeId) {
      throw new Error('Store id not initialized');
    }
    const parsedStoreId = storeIdSchema.safeParse(storeId);
    if (!parsedStoreId.success) {
      throw new Error(
        'Invalid store id; please reset local state and re-onboard'
      );
    }
    const userId = parsedStoreId.data;
    const salt = generateRandomSalt();
    const saltB64 = encodeSalt(salt);

    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    setMasterKey(kek);

    await services.keyStore.clearAll();

    const signing = await services.crypto.generateSigningKeyPair();
    const encryption = await services.crypto.generateEncryptionKeyPair();

    await services.keyStore.saveIdentityKeys(userId, {
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
      encryptionPrivateKey: encryption.privateKey,
      encryptionPublicKey: encryption.publicKey,
    });

    // Start projections only after keys are persisted.
    const meta = { userId, pwdSalt: saltB64 };
    saveMeta(meta);
    setUserMeta(meta);
    setSession({ status: 'ready', userId });
  };

  const unlock = async ({ password }: { password: string }) => {
    if (!services) throw new Error('Services not initialized');
    const meta = loadMeta();
    if (!meta) throw new Error('No user metadata found');
    const saltForUnlock = decodeSalt(meta.pwdSalt);
    const kek = await services.crypto.deriveKeyFromPassword(
      password,
      saltForUnlock
    );
    services.keyStore.setMasterKey(kek);
    const keys = await services.keyStore.getIdentityKeys(meta.userId);
    if (!keys) {
      throw new Error('No keys found, please re-onboard');
    }
    saveMeta({ userId: meta.userId, pwdSalt: meta.pwdSalt });
    setUserMeta({ userId: meta.userId, pwdSalt: meta.pwdSalt });
    setMasterKey(kek);
    setSession({ status: 'ready', userId: meta.userId });
  };

  const resetLocalState = async (): Promise<void> => {
    const currentStoreId = services?.storeId ?? storeId ?? loadStoredStoreId();
    try {
      const goalCtx = services?.contexts.goals;
      const projectCtx = services?.contexts.projects;
      goalCtx?.goalProjection.stop();
      projectCtx?.projectProjection.stop();
      services?.syncEngine.stop();
      services?.publisher.stop();
      await services?.dbShutdown();
      if (currentStoreId) {
        await wipeEventStoreDb(currentStoreId);
      }
      await wipeAllMoLocalOpfs();
    } catch (error) {
      console.warn('Event store shutdown failed', error);
    }
    indexedDB.deleteDatabase('mo-local-keys');
    localStorage.removeItem(USER_META_KEY);
    const nextStoreId = uuidv7();
    localStorage.setItem(STORE_ID_KEY, nextStoreId);
    window.location.reload();
  };

  const rebuildProjections = async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    const goalCtx = services.contexts.goals;
    const projectCtx = services.contexts.projects;
    if (!goalCtx || !projectCtx) return;
    await goalCtx.goalProjection.resetAndRebuild();
    await projectCtx.projectProjection.resetAndRebuild();
  };

  const restoreBackup = async ({
    password,
    backup,
  }: {
    password: string;
    backup: string;
  }) => {
    if (!services) throw new Error('Services not initialized');
    const parsedEnvelope = parseBackupEnvelope(backup);
    const cipherB64 = parsedEnvelope.cipher;
    const meta = loadMeta();
    const decryptSalt =
      (parsedEnvelope.salt ? decodeSalt(parsedEnvelope.salt) : null) ??
      (meta ? decodeSalt(meta.pwdSalt) : null);
    if (!decryptSalt) {
      throw new Error(
        'Backup missing salt and no local metadata available to derive one'
      );
    }

    const decryptKek = await services.crypto.deriveKeyFromPassword(
      password,
      decryptSalt
    );
    services.keyStore.setMasterKey(decryptKek);
    const encrypted = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
    const decrypted = await services.crypto.decrypt(encrypted, decryptKek);
    const payload = parseBackupPayload(
      JSON.parse(new TextDecoder().decode(decrypted))
    );

    const aggregateEntries: Array<[string, string]> = Object.entries(
      payload.aggregateKeys
    );
    const persistSalt =
      parsedEnvelope.salt !== undefined
        ? decodeSalt(parsedEnvelope.salt)
        : generateRandomSalt();
    const persistSaltB64 = encodeSalt(persistSalt);
    const persistKek = await services.crypto.deriveKeyFromPassword(
      password,
      persistSalt
    );
    services.keyStore.setMasterKey(persistKek);

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
    for (const [aggregateId, keyB64] of aggregateEntries) {
      await services.keyStore.saveAggregateKey(
        aggregateId,
        Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
      );
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORE_ID_KEY, payload.userId);
    }
    const targetServices =
      servicesRef.current?.storeId === payload.userId
        ? servicesRef.current
        : await switchToStore(payload.userId);
    targetServices.keyStore.setMasterKey(persistKek);

    const goalCtx = targetServices.contexts.goals;
    const projectCtx = targetServices.contexts.projects;
    if (!goalCtx || !projectCtx) {
      throw new Error('Bounded contexts not bootstrapped');
    }
    const nextMeta = {
      userId: payload.userId,
      pwdSalt: persistSaltB64,
    };
    saveMeta(nextMeta);
    setUserMeta(nextMeta);
    setMasterKey(persistKek);
    setSession({ status: 'ready', userId: payload.userId });
  };

  if (initError) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="rounded-lg border border-border bg-card/90 p-6 shadow-md">
          <div className="space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-accent2">
              Event store error
            </div>
            <div className="text-lg font-semibold">
              Failed to initialize event store
            </div>
            <div className="text-sm text-muted-foreground">{initError}</div>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              If local storage is corrupted, reset local data and re-onboard.
            </div>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                const confirmed = window.confirm(
                  'This will clear local data for this app on this device. You will need to onboard again.'
                );
                if (!confirmed) return;
                await resetLocalState();
              }}
            >
              Reset local data
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!services || !servicesConfig || servicesConfig.storeId !== storeId) {
    return <div>Loading app...</div>;
  }

  if (import.meta.env.DEV) {
    (
      window as {
        __moSyncOnce?: () => Promise<void>;
        __moPendingCount?: () => Promise<number>;
        __moSyncStatus?: () => unknown;
      }
    ).__moSyncOnce = () => services.syncEngine.syncOnce();
    (
      window as {
        __moSyncOnce?: () => Promise<void>;
        __moPendingCount?: () => Promise<number>;
        __moSyncStatus?: () => unknown;
      }
    ).__moPendingCount = async () => {
      const rows = await services.db.query<Readonly<{ count: number }>>(
        'SELECT COUNT(*) as count FROM events e LEFT JOIN sync_event_map m ON m.event_id = e.id WHERE m.event_id IS NULL'
      );
      return Number(rows[0]?.count ?? 0);
    };
    (
      window as {
        __moSyncOnce?: () => Promise<void>;
        __moPendingCount?: () => Promise<number>;
        __moSyncStatus?: () => unknown;
      }
    ).__moSyncStatus = () => services.syncEngine.getStatus();
  }

  const goalCtx = services.contexts.goals;
  const projectCtx = services.contexts.projects;
  if (!goalCtx || !projectCtx) {
    throw new Error('Bounded contexts not bootstrapped');
  }

  const interfaceServices: InterfaceServices = {
    goalCommandBus: goalCtx.goalCommandBus,
    goalQueryBus: goalCtx.goalQueryBus,
    projectCommandBus: projectCtx.projectCommandBus,
    projectQueryBus: projectCtx.projectQueryBus,
    goalProjection: goalCtx.goalProjection,
    projectProjection: projectCtx.projectProjection,
  };

  const interfaceContextValue: InterfaceContextValue = {
    services: interfaceServices,
    session,
  };

  return (
    <>
      <AppContext.Provider
        value={{
          services,
          userMeta,
          session,
          completeOnboarding,
          unlock,
          resetLocalState,
          rebuildProjections,
          masterKey,
          restoreBackup,
        }}
      >
        <InterfaceProvider value={interfaceContextValue}>
          {children}
        </InterfaceProvider>
      </AppContext.Provider>
      {debugInfo && import.meta.env.DEV && session.status === 'ready' ? (
        <DebugPanel
          info={{
            opfsAvailable: debugInfo.opfsAvailable,
            tables: debugInfo.tables ?? [],
            note: debugInfo.note,
            storeId: debugInfo.storeId,
            storage: debugInfo.storage,
            eventCount: debugInfo.eventCount,
            aggregateCount: debugInfo.aggregateCount,
            onRebuild: debugInfo.onRebuild,
            onDownloadDb: debugInfo.onDownloadDb,
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
