import { createContext, useContext, useEffect, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import { createBrowserServices } from '@mo/infrastructure/browser';
import { DebugPanel } from '../components/DebugPanel';
import { adapter } from './LiveStoreAdapter';
import { deriveSaltForUser } from '../lib/deriveSalt';
import { z } from 'zod';

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

type Services = Awaited<ReturnType<typeof createBrowserServices>>;

type AppContextValue = {
  services: Services;
  session: SessionState;
  completeOnboarding: (params: { password: string }) => Promise<void>;
  unlock: (params: { password: string }) => Promise<void>;
  resetLocalState: () => Promise<void>;
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
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const currentStoreId = loadStoreId();
        const svc = await createBrowserServices({
          adapter,
          storeId: currentStoreId,
        });
        setDebugInfo({
          storeId: svc.store.storeId,
          opfsAvailable:
            typeof navigator !== 'undefined' &&
            !!navigator.storage &&
            typeof navigator.storage.getDirectory === 'function',
          storage: 'opfs',
          note: 'LiveStore adapter (opfs)',
        });

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
    };
  }, []);

  useEffect(() => {
    if (!services) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      const meta = loadMeta();
      if (!meta) {
        if (!signal.aborted) setSession({ status: 'needs-onboarding' });
        return;
      }
      if (!signal.aborted) {
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
    const salt = await deriveSaltForUser(userId);

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

    // Start projection only after keys are persisted.
    await services.goalProjection.start();
    saveMeta({ userId });
    setSession({ status: 'ready', userId });
  };
  const unlock = async ({ password }: { password: string }) => {
    if (!services) throw new Error('Services not initialized');
    const meta = loadMeta();
    if (!meta) throw new Error('No user metadata found');
    const salt = meta.pwdSalt
      ? Uint8Array.from(atob(meta.pwdSalt), (c) => c.charCodeAt(0))
      : await deriveSaltForUser(meta.userId);
    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    const keys = await services.keyStore.getIdentityKeys(meta.userId);
    if (!keys) {
      throw new Error('No keys found, please re-onboard');
    }
    setMasterKey(kek);
    await services.goalProjection.start();
    setSession({ status: 'ready', userId: meta.userId });
  };

  const resetLocalState = async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    try {
      services.goalProjection.stop();
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

  const restoreBackup = async ({
    password,
    backup,
  }: {
    password: string;
    backup: string;
  }) => {
    if (!services) throw new Error('Services not initialized');
    const envelopeSchema = z.object({
      cipher: z.string().min(1),
      salt: z.string().optional(),
    });
    const parsedEnvelope = (() => {
      try {
        return envelopeSchema.parse(JSON.parse(backup));
      } catch {
        return envelopeSchema.parse({ cipher: backup.trim() });
      }
    })();
    const cipherB64 = parsedEnvelope.cipher;
    const meta = loadMeta();
    let saltB64 = parsedEnvelope.salt ?? meta?.pwdSalt ?? null;
    if (!saltB64 && meta?.userId) {
      const derivedSalt = await deriveSaltForUser(meta.userId);
      saltB64 = btoa(String.fromCharCode(...derivedSalt));
    }
    if (!saltB64) {
      throw new Error('Backup missing salt and no local metadata available');
    }
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const kek = await services.crypto.deriveKeyFromPassword(password, salt);
    services.keyStore.setMasterKey(kek);
    const encrypted = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
    const decrypted = await services.crypto.decrypt(encrypted, kek);
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
    const aggregateEntries: Array<[string, string]> = Object.entries(
      payload.aggregateKeys
    );
    for (const [aggregateId, keyB64] of aggregateEntries) {
      await services.keyStore.saveAggregateKey(
        aggregateId,
        Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
      );
    }

    await services.goalProjection.start();
    saveMeta({
      userId: payload.userId,
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
          resetLocalState,
          masterKey,
          restoreBackup,
        }}
      >
        {children}
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
