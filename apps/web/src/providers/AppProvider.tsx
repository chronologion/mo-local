import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import { createAppServices } from '../bootstrap/createAppServices';
import { DebugPanel } from '../components/DebugPanel';
import { adapter } from './LiveStoreAdapter';
import { tables } from '@mo/infrastructure/browser';
import {
  decodeSalt,
  deriveLegacySaltForUser,
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
import { setSyncGateEnabled } from '@mo/infrastructure/livestore/sync/syncGate';
import { useRemoteAuth } from './RemoteAuthProvider';
import { resetSyncHeadInOpfs } from '../utils/resetSyncHead';

const USER_META_KEY = 'mo-local-user';
const RESET_FLAG_KEY = 'mo-local-reset-persistence';
const STORE_ID_KEY = 'mo-local-store-id';

const loadStoredStoreId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORE_ID_KEY);
};

type UserMeta = {
  userId: string;
  pwdSalt?: string;
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

const getStoreShutdownPromise = (
  store: Services['store']
): (() => Promise<void>) | null => {
  const candidate = store as { shutdownPromise?: unknown };
  return typeof candidate.shutdownPromise === 'function'
    ? (candidate.shutdownPromise as () => Promise<void>)
    : null;
};

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
  userId: z.string().min(1),
  pwdSalt: z.string().optional(),
});

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
    onResetSyncHead?: () => void;
  } | null>(null);

  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const sagaBootstrappedRef = useRef<Set<string>>(new Set());
  const publisherStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const enabled =
      session.status === 'ready' && remoteAuthState.status === 'connected';
    setSyncGateEnabled(enabled);
  }, [remoteAuthState.status, session.status]);

  useEffect(() => {
    const meta = loadMeta();
    const storedStoreId = loadStoredStoreId();
    if (meta) {
      setUserMeta(meta);
      setSession({ status: 'locked', userId: meta.userId });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORE_ID_KEY, meta.userId);
      }
      setStoreId(meta.userId);
      return;
    }

    setUserMeta(null);
    setSession({ status: 'needs-onboarding' });
    const fallbackStoreId = storedStoreId ?? uuidv7();
    if (typeof localStorage !== 'undefined') {
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
          adapter,
          storeId,
          contexts: ['goals', 'projects'],
        });
        const updateDebug = () => {
          const tablesList = (() => {
            try {
              const res = svc.store.query<{ name: string }[]>({
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
              const res = svc.store.query<{ count: number }[]>({
                // Total events in the canonical LiveStore log.
                query:
                  'SELECT COUNT(*) as count FROM __livestore_session_changeset WHERE (? IS NULL OR 1 = 1)',
                bindValues: [Date.now()],
              });
              return Number(res?.[0]?.count ?? 0);
            } catch {
              return 0;
            }
          })();
          const aggregateCount = (() => {
            try {
              const res = svc.store.query<{ count: number }[]>({
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
            storeId: svc.store.storeId,
            opfsAvailable:
              typeof navigator !== 'undefined' &&
              !!navigator.storage &&
              typeof navigator.storage.getDirectory === 'function',
            storage: 'opfs',
            note: 'LiveStore adapter (opfs)',
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
            onResetSyncHead: () => {
              void (async () => {
                try {
                  try {
                    svc.contexts.goals?.goalProjection.stop();
                    svc.contexts.projects?.projectProjection.stop();
                    const maybeShutdown = getStoreShutdownPromise(svc.store);
                    if (maybeShutdown) {
                      await maybeShutdown();
                    }
                  } catch (error) {
                    console.warn(
                      'LiveStore shutdown failed before reset',
                      error
                    );
                  }
                  const ok = await resetSyncHeadInOpfs(svc.store.storeId);
                  if (!ok) {
                    alert(
                      'Unable to find eventlog DB with __livestore_sync_status; sync head not reset.'
                    );
                    return;
                  }
                  alert('Sync head reset to 0. Reloading to trigger re-push.');
                  window.location.reload();
                } catch (error) {
                  console.error('Failed to reset sync head', error);
                  alert(
                    error instanceof Error
                      ? error.message
                      : 'Failed to reset sync head'
                  );
                }
              })();
            },
          });
        };

        unsubscribe = svc.store.subscribe(tables.goal_events.count(), () =>
          updateDebug()
        );
        updateDebug();
        if (import.meta.env.DEV) {
          intervalId = window.setInterval(() => {
            updateDebug();
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
        const maybeShutdown = createdServices
          ? getStoreShutdownPromise(createdServices.store)
          : null;
        void maybeShutdown?.();
      } catch (error) {
        console.warn('Failed to shutdown LiveStore cleanly', error);
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

  const completeOnboarding = async ({ password }: { password: string }) => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    const userId = storeId ?? uuidv7();
    const salt = generateRandomSalt();
    const saltB64 = encodeSalt(salt);

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

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORE_ID_KEY, userId);
    }
    const nextServices =
      servicesRef.current?.storeId === userId
        ? servicesRef.current
        : await switchToStore(userId);
    nextServices.keyStore.setMasterKey(kek);
    setMasterKey(kek);

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
    const storedSalt = meta.pwdSalt ? decodeSalt(meta.pwdSalt) : null;
    const legacySalt = storedSalt
      ? null
      : await deriveLegacySaltForUser(meta.userId);
    const saltForUnlock = storedSalt ?? legacySalt;
    if (!saltForUnlock) {
      throw new Error('Unable to determine password salt for unlock');
    }
    const kek = await services.crypto.deriveKeyFromPassword(
      password,
      saltForUnlock
    );
    services.keyStore.setMasterKey(kek);
    const keys = await services.keyStore.getIdentityKeys(meta.userId);
    if (!keys) {
      throw new Error('No keys found, please re-onboard');
    }

    let nextMasterKey = kek;
    let nextSaltB64 = meta.pwdSalt ?? encodeSalt(saltForUnlock);

    if (!meta.pwdSalt) {
      // Migrate deterministic salt users to a random per-user salt.
      const backup = await services.keyStore.exportKeys();
      const freshSalt = generateRandomSalt();
      nextSaltB64 = encodeSalt(freshSalt);
      nextMasterKey = await services.crypto.deriveKeyFromPassword(
        password,
        freshSalt
      );
      services.keyStore.setMasterKey(nextMasterKey);
      await services.keyStore.importKeys({
        ...backup,
        userId: backup.userId ?? meta.userId,
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORE_ID_KEY, meta.userId);
    }
    const targetServices =
      servicesRef.current?.storeId === meta.userId
        ? servicesRef.current
        : await switchToStore(meta.userId);
    targetServices.keyStore.setMasterKey(nextMasterKey);

    saveMeta({ userId: meta.userId, pwdSalt: nextSaltB64 });
    setUserMeta({ userId: meta.userId, pwdSalt: nextSaltB64 });
    setMasterKey(nextMasterKey);
    setSession({ status: 'ready', userId: meta.userId });
  };

  const resetLocalState = async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    try {
      const goalCtx = services.contexts.goals;
      const projectCtx = services.contexts.projects;
      goalCtx?.goalProjection.stop();
      projectCtx?.projectProjection.stop();
      const maybeShutdown = getStoreShutdownPromise(services.store);
      await maybeShutdown?.();
    } catch (error) {
      console.warn('LiveStore shutdown failed', error);
    }
    indexedDB.deleteDatabase('mo-local-keys');
    localStorage.removeItem(USER_META_KEY);
    const nextStoreId = uuidv7();
    localStorage.setItem(STORE_ID_KEY, nextStoreId);
    localStorage.removeItem(RESET_FLAG_KEY);
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
      (meta?.pwdSalt ? decodeSalt(meta.pwdSalt) : null) ??
      (meta?.userId ? await deriveLegacySaltForUser(meta.userId) : null);
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
    const payloadSchema = z.object({
      userId: z.string().min(1),
      identityKeys: z
        .object({
          signingPrivateKey: z.string().min(1),
          signingPublicKey: z.string().min(1),
          encryptionPrivateKey: z.string().min(1),
          encryptionPublicKey: z.string().min(1),
        })
        .nullable(),
      aggregateKeys: z.record(z.string(), z.string().min(1)),
    });
    const payload = payloadSchema.parse(
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
    return <div>Failed to initialize LiveStore: {initError}</div>;
  }

  if (!services || !servicesConfig || servicesConfig.storeId !== storeId) {
    return <div>Loading app...</div>;
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
            onRebuild: debugInfo.onRebuild,
            onResetSyncHead: debugInfo.onResetSyncHead,
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
