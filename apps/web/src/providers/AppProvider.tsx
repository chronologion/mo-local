import { createContext, useContext, useEffect, useState } from 'react';
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
import { parseBackupEnvelope } from '@mo/interface';
import { z } from 'zod';
import {
  InterfaceProvider,
  type InterfaceContextValue,
  type InterfaceServices,
} from '@mo/interface/react';

const USER_META_KEY = 'mo-local-user';
const RESET_FLAG_KEY = 'mo-local-reset-persistence';
const STORE_ID_KEY = 'mo-local-store-id';
const DEFAULT_STORE_ID = 'mo-local-v2';

const loadStoreId = (): string => {
  if (typeof localStorage === 'undefined') return DEFAULT_STORE_ID;
  const existing = localStorage.getItem(STORE_ID_KEY);
  if (existing) return existing;
  localStorage.setItem(STORE_ID_KEY, DEFAULT_STORE_ID);
  return DEFAULT_STORE_ID;
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
  } | null>(null);

  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let unsubscribe: (() => void) | undefined;
    let intervalId: number | undefined;
    (async () => {
      try {
        const currentStoreId = loadStoreId();
        const svc = await createAppServices({
          adapter,
          storeId: currentStoreId,
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
            onRebuild: rebuildProjections,
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
          setServices(svc);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to initialize app';
        if (!signal.aborted) {
          setInitError(message);
        }
      }
    })();
    return () => {
      controller.abort();
      unsubscribe?.();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    if (!services) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      const meta = loadMeta();
      if (!meta) {
        if (!signal.aborted) {
          setUserMeta(null);
          setSession({ status: 'needs-onboarding' });
        }
        return;
      }
      if (!signal.aborted) {
        setUserMeta(meta);
        setSession({ status: 'locked', userId: meta.userId });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [services]);

  const completeOnboarding = async ({ password }: { password: string }) => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    const userId = uuidv7();
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

    // Start projections only after keys are persisted.
    const goalCtx = services.contexts.goals;
    const projectCtx = services.contexts.projects;
    if (!goalCtx || !projectCtx) {
      throw new Error('Bounded contexts not bootstrapped');
    }
    await goalCtx.goalProjection.start();
    await projectCtx.projectProjection.start();
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

    saveMeta({ userId: meta.userId, pwdSalt: nextSaltB64 });
    setUserMeta({ userId: meta.userId, pwdSalt: nextSaltB64 });
    setMasterKey(nextMasterKey);
    const goalCtx = services.contexts.goals;
    const projectCtx = services.contexts.projects;
    if (!goalCtx || !projectCtx) {
      throw new Error('Bounded contexts not bootstrapped');
    }
    await goalCtx.goalProjection.start();
    await projectCtx.projectProjection.start();
    setSession({ status: 'ready', userId: meta.userId });
  };

  const resetLocalState = async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    try {
      const goalCtx = services.contexts.goals;
      const projectCtx = services.contexts.projects;
      goalCtx?.goalProjection.stop();
      projectCtx?.projectProjection.stop();
      await (
        services.store as unknown as { shutdownPromise?: () => Promise<void> }
      ).shutdownPromise?.();
    } catch (error) {
      console.warn('LiveStore shutdown failed', error);
    }
    indexedDB.deleteDatabase('mo-local-keys');
    localStorage.removeItem(USER_META_KEY);
    const nextStoreId = `${DEFAULT_STORE_ID}-${uuidv7()}`;
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

    const goalCtx = services.contexts.goals;
    const projectCtx = services.contexts.projects;
    if (!goalCtx || !projectCtx) {
      throw new Error('Bounded contexts not bootstrapped');
    }
    await goalCtx.goalProjection.start();
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

  if (!services) {
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
      {debugInfo && import.meta.env.DEV ? (
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
