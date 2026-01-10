import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { uuidv4 } from '@mo/domain';
import { createAppServices } from '../bootstrap/createAppServices';
import { DebugPanel } from '../components/DebugPanel';
import { generateRandomSalt } from '@mo/infrastructure/crypto/deriveSalt';
import { z } from 'zod';
import { InterfaceProvider, type InterfaceContextValue, type InterfaceServices } from '@mo/presentation/react';
import { useRemoteAuth } from './RemoteAuthProvider';
import { wipeAllMoLocalOpfs, wipeEventStoreDb } from '../utils/resetEventStoreDb';
import { Button } from '../components/ui/button';
import { createKeyVaultEnvelope, parseKeyVaultEnvelope } from '../backup/keyVaultEnvelope';
import type { KdfParams, KeyServiceRequest, KeyServiceResponse, SessionId, UserId } from '@mo/key-service-web';
import { enrollUserPresenceUnlock, isUserPresenceSupported, type UserPresenceEnrollOptions } from '@mo/key-service-web';

const USER_META_KEY = 'mo-local-user';
const STORE_ID_KEY = 'mo-local-store-id';

const loadStoredStoreId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORE_ID_KEY);
};

type UserMeta = {
  /**
   * Stable local identity id (UUIDv4). Used for `actorId` and identity key records.
   */
  userId: string;
  deviceId: string;
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
  completeOnboarding: (params: { password: string; enablePasskey?: boolean }) => Promise<void>;
  unlock: (params: { password: string; enablePasskey?: boolean }) => Promise<void>;
  unlockWithUserPresence: (params: { userPresenceSecret: Uint8Array }) => Promise<void>;
  resetLocalState: () => Promise<void>;
  rebuildProjections: () => Promise<void>;
  exportKeyVaultBackup: (params: { password: string }) => Promise<string>;
  restoreBackup: (params: {
    password: string;
    backup: string;
    db?: Readonly<{
      bytes: Uint8Array;
    }>;
  }) => Promise<void>;
  requestKeyService: <T extends KeyServiceRequest['type']>(
    request: KeyServiceRequestByType<T>
  ) => Promise<KeyServiceResponseByType<T>['payload']>;
};

const AppContext = createContext<AppContextValue | null>(null);

const userMetaSchema = z.object({
  userId: z.uuid(),
  deviceId: z.string().min(1),
});

const storeIdSchema = z.uuid();
// UUIDs are validated before branding to UserId.
const toUserId = (value: string): UserId => value as UserId;

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

type KeyServiceRequestByType<T extends KeyServiceRequest['type']> = Extract<KeyServiceRequest, { type: T }>;
type KeyServiceResponseByType<T extends KeyServiceResponse['type']> = Extract<KeyServiceResponse, { type: T }>;

const buildKdfParams = (): KdfParams => {
  return {
    id: 'kdf-1',
    salt: generateRandomSalt(),
    memoryKib: 65_536,
    iterations: 3,
    parallelism: 1,
  };
};

const randomBytes = (length: number): Uint8Array => {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto unavailable');
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const encodePassphrase = (password: string): Uint8Array => new TextEncoder().encode(password);

const safeZeroize = (bytes: Uint8Array): void => {
  try {
    bytes.fill(0);
  } catch {
    // Ignore detached buffers (transferred to worker).
  }
};

const toBase64 = (data: Uint8Array): string => btoa(String.fromCharCode(...Array.from(data)));

type DebugWindow = Window & {
  __moSyncOnce?: () => Promise<void>;
  __moPullOnce?: () => Promise<void>;
  __moPushOnce?: () => Promise<void>;
  __moSyncStart?: () => void;
  __moSyncStop?: () => void;
  __moPendingCount?: () => Promise<number>;
  __moSyncStatus?: () => unknown;
  __moResetSyncState?: () => Promise<void>;
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
  const [keyStoreReady, setKeyStoreReady] = useState(false);
  const [keyServiceSessionId, setKeyServiceSessionId] = useState<SessionId | null>(null);
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
    onResetSync?: () => void;
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
      setKeyStoreReady(false);
      setKeyServiceSessionId(null);
      const nextStoreId = meta.userId;
      if (typeof localStorage !== 'undefined' && storedStoreId !== nextStoreId) {
        localStorage.setItem(STORE_ID_KEY, nextStoreId);
      }
      setStoreId(nextStoreId);
      return;
    }

    setUserMeta(null);
    setSession({ status: 'needs-onboarding' });
    setKeyStoreReady(false);
    setKeyServiceSessionId(null);
    const fallbackStoreId = (() => {
      if (storedStoreId) {
        const parsed = storeIdSchema.safeParse(storedStoreId);
        if (parsed.success) return parsed.data;
      }
      return uuidv4();
    })();
    if (typeof localStorage !== 'undefined' && storedStoreId !== fallbackStoreId) {
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
              const res = await svc.db.query<Readonly<{ count: number }>>('SELECT COUNT(*) as count FROM events');
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
            onResetSync: () => {
              void resetSyncState();
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
          if (pendingInitResolver.current && pendingInitResolver.current.targetStoreId === svc.storeId) {
            pendingInitResolver.current.resolve(svc);
            pendingInitResolver.current = null;
          }
        }
        createdServices = svc;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize app';
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
        void createdServices?.keyServiceShutdown();
        void createdServices?.dbShutdown();
      } catch (error) {
        console.warn('Failed to shutdown event store cleanly', error);
      }
      if (pendingInitResolver.current && pendingInitResolver.current.targetStoreId === storeId) {
        pendingInitResolver.current.reject(new Error('Store initialization aborted'));
        pendingInitResolver.current = null;
      }
    };
  }, [storeId]);

  useEffect(() => {
    if (session.status !== 'ready') {
      setKeyStoreReady(false);
      setKeyServiceSessionId(null);
    }
  }, [session.status]);

  const switchToStore = async (targetStoreId: string): Promise<Services> => {
    if (servicesRef.current && servicesRef.current.storeId === targetStoreId && services) {
      return servicesRef.current;
    }
    return await new Promise<Services>((resolve, reject) => {
      pendingInitResolver.current = { resolve, reject, targetStoreId };
      setStoreId(targetStoreId);
    });
  };

  const requestKeyService = async <T extends KeyServiceRequest['type']>(
    request: KeyServiceRequestByType<T>
  ): Promise<KeyServiceResponseByType<T>['payload']> => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    return requestKeyServiceFor(services, request);
  };

  const requestKeyServiceFor = async <T extends KeyServiceRequest['type']>(
    targetServices: Services,
    request: KeyServiceRequestByType<T>
  ): Promise<KeyServiceResponseByType<T>['payload']> => {
    const response = await targetServices.keyService.request(request);
    if (response.type !== request.type) {
      throw new Error(`Key service response mismatch: expected ${request.type}, got ${response.type}`);
    }
    // Safe due to response type equality check above.
    return response.payload as KeyServiceResponseByType<T>['payload'];
  };

  useEffect(() => {
    if (!services || session.status !== 'ready' || !keyStoreReady) return;
    let cancelled = false;
    const currentServices = services;
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
        if (error instanceof Error && error.message.includes('Store has been shut down')) {
          return;
        }
        console.warn('Failed to start projections', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, keyStoreReady, session.status]);

  useEffect(() => {
    if (!services || session.status !== 'ready' || !keyStoreReady) return;
    if (remoteAuthState.status !== 'connected') {
      services.syncEngine.stop();
      return;
    }
    services.syncEngine.start();
    void services.syncEngine.syncOnce().catch(() => undefined);
    return () => {
      services.syncEngine.stop();
    };
  }, [services, keyStoreReady, session.status, remoteAuthState.status]);

  const completeOnboarding = async ({ password, enablePasskey }: { password: string; enablePasskey?: boolean }) => {
    if (!services) {
      throw new Error('Services not initialized');
    }
    if (!storeId) {
      throw new Error('Store id not initialized');
    }
    const parsedStoreId = storeIdSchema.safeParse(storeId);
    if (!parsedStoreId.success) {
      throw new Error('Invalid store id; please reset local state and re-onboard');
    }
    const userId = toUserId(parsedStoreId.data);
    const deviceId = uuidv4();
    const passphraseForCreate = encodePassphrase(password);
    const passphraseForUnlock = encodePassphrase(password);
    const passphraseForStepUp = enablePasskey ? encodePassphrase(password) : null;
    try {
      const kdfParams = buildKdfParams();
      await requestKeyService({
        type: 'createVault',
        payload: {
          userId,
          passphraseUtf8: passphraseForCreate,
          kdfParams,
        },
      });
      const unlock = await requestKeyService({
        type: 'unlock',
        payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlock },
      });
      const sessionId = unlock.sessionId;
      const masterKey = randomBytes(32);
      const masterKeyForStore = new Uint8Array(masterKey);
      await requestKeyService({
        type: 'storeAppMasterKey',
        payload: { sessionId, masterKey },
      });
      services.keyStore.setMasterKey(masterKeyForStore);
      safeZeroize(masterKeyForStore);
      safeZeroize(masterKey);

      // Enroll passkey if requested
      if (enablePasskey && isUserPresenceSupported() && passphraseForStepUp) {
        try {
          // Step-up before enabling
          await requestKeyService({
            type: 'stepUp',
            payload: { sessionId, passphraseUtf8: passphraseForStepUp },
          });

          // Get PRF salt
          const prfInfo = await requestKeyService({
            type: 'getUserPresenceUnlockInfo',
            payload: {},
          });

          if (!prfInfo.enabled) {
            // Enroll the passkey
            const enrollOptions: UserPresenceEnrollOptions = {
              rpName: 'Mo Local',
              rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
              userId: new TextEncoder().encode(userId),
              userName: userId,
              userDisplayName: `User ${userId.slice(0, 8)}`,
              prfSalt: prfInfo.prfSalt,
              timeoutMs: 60_000,
            };

            const { credentialId, userPresenceSecret } = await enrollUserPresenceUnlock(enrollOptions);

            // Store in key service
            await requestKeyService({
              type: 'enableUserPresenceUnlock',
              payload: {
                sessionId,
                credentialId,
                userPresenceSecret,
              },
            });
          }
        } catch (err) {
          // Don't fail onboarding if passkey enrollment fails
          console.warn('Passkey enrollment failed:', err);
        }
      }

      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);

      const meta = { userId, deviceId };
      saveMeta(meta);
      setUserMeta(meta);
      setSession({ status: 'ready', userId });
    } finally {
      safeZeroize(passphraseForCreate);
      safeZeroize(passphraseForUnlock);
      if (passphraseForStepUp) safeZeroize(passphraseForStepUp);
    }
  };

  const unlock = async ({ password, enablePasskey }: { password: string; enablePasskey?: boolean }) => {
    if (!services) throw new Error('Services not initialized');
    const meta = loadMeta();
    if (!meta) throw new Error('No user metadata found');
    const passphraseUtf8 = encodePassphrase(password);
    const passphraseForStepUp = enablePasskey ? encodePassphrase(password) : null;
    try {
      const unlockResponse = await requestKeyService({
        type: 'unlock',
        payload: { method: 'passphrase', passphraseUtf8 },
      });
      const sessionId = unlockResponse.sessionId;
      const master = await requestKeyService({
        type: 'getAppMasterKey',
        payload: { sessionId },
      });
      services.keyStore.setMasterKey(master.masterKey);
      safeZeroize(master.masterKey);

      // Enroll passkey if requested
      if (enablePasskey && isUserPresenceSupported() && passphraseForStepUp) {
        try {
          // Step-up before enabling
          await requestKeyService({
            type: 'stepUp',
            payload: { sessionId, passphraseUtf8: passphraseForStepUp },
          });

          // Get PRF salt
          const prfInfo = await requestKeyService({
            type: 'getUserPresenceUnlockInfo',
            payload: {},
          });

          if (!prfInfo.enabled) {
            // Enroll the passkey
            const enrollOptions: UserPresenceEnrollOptions = {
              rpName: 'Mo Local',
              rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
              userId: new TextEncoder().encode(meta.userId),
              userName: meta.userId,
              userDisplayName: `User ${meta.userId.slice(0, 8)}`,
              prfSalt: prfInfo.prfSalt,
              timeoutMs: 60_000,
            };

            const { credentialId, userPresenceSecret } = await enrollUserPresenceUnlock(enrollOptions);

            // Store in key service
            await requestKeyService({
              type: 'enableUserPresenceUnlock',
              payload: {
                sessionId,
                credentialId,
                userPresenceSecret,
              },
            });
          }
        } catch (err) {
          // Don't fail unlock if passkey enrollment fails
          console.warn('Passkey enrollment failed:', err);
        }
      }

      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);
      saveMeta(meta);
      setUserMeta(meta);
      setSession({ status: 'ready', userId: meta.userId });
    } finally {
      safeZeroize(passphraseUtf8);
      if (passphraseForStepUp) safeZeroize(passphraseForStepUp);
    }
  };

  const unlockWithUserPresence = async ({ userPresenceSecret }: { userPresenceSecret: Uint8Array }) => {
    if (!services) throw new Error('Services not initialized');
    const meta = loadMeta();
    if (!meta) throw new Error('No user metadata found');
    try {
      const unlockResponse = await requestKeyService({
        type: 'unlock',
        payload: { method: 'userPresence', userPresenceSecret },
      });
      const sessionId = unlockResponse.sessionId;
      const master = await requestKeyService({
        type: 'getAppMasterKey',
        payload: { sessionId },
      });
      services.keyStore.setMasterKey(master.masterKey);
      safeZeroize(master.masterKey);
      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);
      saveMeta(meta);
      setUserMeta(meta);
      setSession({ status: 'ready', userId: meta.userId });
    } finally {
      safeZeroize(userPresenceSecret);
    }
  };

  const exportKeyVaultBackup = async ({ password }: { password: string }): Promise<string> => {
    if (!services) throw new Error('Services not initialized');
    if (!keyServiceSessionId) {
      throw new Error('Key service session missing; unlock first.');
    }
    const passphraseUtf8 = encodePassphrase(password);
    try {
      await requestKeyService({
        type: 'stepUp',
        payload: { sessionId: keyServiceSessionId, passphraseUtf8 },
      });
      const exportResponse = await requestKeyService({
        type: 'exportKeyVault',
        payload: { sessionId: keyServiceSessionId },
      });
      const envelope = createKeyVaultEnvelope({
        cipher: toBase64(exportResponse.blob),
        userId: session.status === 'ready' ? session.userId : undefined,
        exportedAt: new Date().toISOString(),
        version: 1,
      });
      return JSON.stringify(envelope, null, 2);
    } finally {
      safeZeroize(passphraseUtf8);
    }
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
    if (currentStoreId) {
      indexedDB.deleteDatabase(`mo-key-service-${currentStoreId}`);
    }
    localStorage.removeItem(USER_META_KEY);
    setKeyStoreReady(false);
    setKeyServiceSessionId(null);
    const nextStoreId = uuidv4();
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

  const resetSyncState = async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    services.syncEngine.stop();
    await services.syncEngine.resetSyncState();
    services.syncEngine.start();
    await services.syncEngine.syncOnce().catch(() => undefined);
  };

  const restoreBackup = async ({
    password,
    backup,
    db,
  }: {
    password: string;
    backup: string;
    db?: Readonly<{
      bytes: Uint8Array;
    }>;
  }) => {
    if (!services) throw new Error('Services not initialized');
    const parsedEnvelope = parseKeyVaultEnvelope(backup);
    const cipherB64 = parsedEnvelope.cipher;
    const targetUserId = toUserId(parsedEnvelope.userId ?? storeId ?? uuidv4());
    const passphraseForCreate = encodePassphrase(password);
    const passphraseForUnlock = encodePassphrase(password);
    const passphraseForStepUp = encodePassphrase(password);
    const passphraseForUnlockAfter = encodePassphrase(password);
    const vaultBytes = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
    const targetServices =
      servicesRef.current?.storeId === targetUserId ? servicesRef.current : await switchToStore(targetUserId);
    if (!targetServices) {
      throw new Error('Failed to initialize target services');
    }

    try {
      const kdfParams = buildKdfParams();
      await requestKeyServiceFor(targetServices, {
        type: 'createVault',
        payload: { userId: targetUserId, passphraseUtf8: passphraseForCreate, kdfParams },
      });
      const unlock = await requestKeyServiceFor(targetServices, {
        type: 'unlock',
        payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlock },
      });
      await requestKeyServiceFor(targetServices, {
        type: 'stepUp',
        payload: { sessionId: unlock.sessionId, passphraseUtf8: passphraseForStepUp },
      });
      await requestKeyServiceFor(targetServices, {
        type: 'importKeyVault',
        payload: { sessionId: unlock.sessionId, blob: vaultBytes },
      });
      await requestKeyServiceFor(targetServices, {
        type: 'lock',
        payload: { sessionId: unlock.sessionId },
      });
      const unlockAfter = await requestKeyServiceFor(targetServices, {
        type: 'unlock',
        payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlockAfter },
      });
      const master = await requestKeyServiceFor(targetServices, {
        type: 'getAppMasterKey',
        payload: { sessionId: unlockAfter.sessionId },
      });
      targetServices.keyStore.setMasterKey(master.masterKey);
      safeZeroize(master.masterKey);
      setKeyStoreReady(true);
      setKeyServiceSessionId(unlockAfter.sessionId);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORE_ID_KEY, targetUserId);
      }

      if (db) {
        if (!targetServices.db.importMainDatabase) {
          throw new Error('This build does not support restoring DB files');
        }
        await targetServices.db.importMainDatabase(db.bytes);
      }

      const goalCtx = targetServices.contexts.goals;
      const projectCtx = targetServices.contexts.projects;
      if (!goalCtx || !projectCtx) {
        throw new Error('Bounded contexts not bootstrapped');
      }

      await goalCtx.goalProjection.resetAndRebuild();
      await projectCtx.projectProjection.resetAndRebuild();
      const nextMeta = {
        userId: targetUserId,
        deviceId: uuidv4(),
      };
      saveMeta(nextMeta);
      setUserMeta(nextMeta);
      setSession({ status: 'ready', userId: targetUserId });
    } finally {
      safeZeroize(passphraseForCreate);
      safeZeroize(passphraseForUnlock);
      safeZeroize(passphraseForStepUp);
      safeZeroize(passphraseForUnlockAfter);
    }
  };

  if (initError) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="rounded-lg border border-border bg-card/90 p-6 shadow-md">
          <div className="space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-accent2">Event store error</div>
            <div className="text-lg font-semibold">Failed to initialize event store</div>
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
    const debugWindow = window as DebugWindow;
    debugWindow.__moSyncOnce = () => services.syncEngine.syncOnce();
    debugWindow.__moPullOnce = () => services.syncEngine.debugPullOnce({ waitMs: 0 });
    debugWindow.__moPushOnce = () => services.syncEngine.debugPushOnce();
    debugWindow.__moSyncStart = () => services.syncEngine.start();
    debugWindow.__moSyncStop = () => services.syncEngine.stop();
    debugWindow.__moPendingCount = async () => {
      const rows = await services.db.query<Readonly<{ count: number }>>(
        'SELECT COUNT(*) as count FROM events e LEFT JOIN sync_event_map m ON m.event_id = e.id WHERE m.event_id IS NULL'
      );
      return Number(rows[0]?.count ?? 0);
    };
    debugWindow.__moSyncStatus = () => services.syncEngine.getStatus();
    debugWindow.__moResetSyncState = resetSyncState;
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
          unlockWithUserPresence,
          resetLocalState,
          rebuildProjections,
          exportKeyVaultBackup,
          restoreBackup,
          requestKeyService,
        }}
      >
        <InterfaceProvider value={interfaceContextValue}>{children}</InterfaceProvider>
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
            onResetSync: debugInfo.onResetSync,
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
