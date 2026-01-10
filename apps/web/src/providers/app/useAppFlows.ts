import { useCallback } from 'react';
import { uuidv4 } from '@mo/domain';
import type { KeyServiceRequest, SessionId, UserId } from '@mo/key-service-web';
import { z } from 'zod';
import { wipeAllMoLocalOpfs, wipeEventStoreDb } from '../../utils/resetEventStoreDb';
import {
  completeOnboardingFlow,
  exportKeyVaultBackupFlow,
  restoreBackupFlow,
  unlockFlow,
  type KeyServiceRequestByType,
  type KeyServiceResponseByType,
} from './keyServiceFlows';
import { clearMeta, loadMeta, loadStoredStoreId, saveMeta, STORE_ID_KEY, type UserMeta } from './localMeta';
import type { PendingInitResolver } from './servicesLifecycle';
import type { Services } from './types';

type MutableRef<T> = { current: T };

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'locked'; userId: string }
  | {
      status: 'ready';
      userId: string;
    };

type UseAppFlowsParams = {
  services: Services | null;
  storeId: string | null;
  servicesRef: MutableRef<Services | null>;
  pendingInitResolver: MutableRef<PendingInitResolver | null>;
  session: SessionState;
  keyServiceSessionId: SessionId | null;
  setSession: React.Dispatch<React.SetStateAction<SessionState>>;
  setUserMeta: React.Dispatch<React.SetStateAction<UserMeta | null>>;
  setKeyStoreReady: React.Dispatch<React.SetStateAction<boolean>>;
  setKeyServiceSessionId: React.Dispatch<React.SetStateAction<SessionId | null>>;
  setStoreId: React.Dispatch<React.SetStateAction<string | null>>;
};

type UseAppFlowsReturn = {
  completeOnboarding: (params: { password: string }) => Promise<void>;
  unlock: (params: { password: string }) => Promise<void>;
  exportKeyVaultBackup: (params: { password: string }) => Promise<string>;
  resetLocalState: () => Promise<void>;
  rebuildProjections: () => Promise<void>;
  resetSyncState: () => Promise<void>;
  restoreBackup: (params: { password: string; backup: string; db?: Readonly<{ bytes: Uint8Array }> }) => Promise<void>;
};

const storeIdSchema = z.uuid();
const toUserId = (value: string): UserId => value as UserId;

export function useAppFlows({
  services,
  storeId,
  servicesRef,
  pendingInitResolver,
  session,
  keyServiceSessionId,
  setSession,
  setUserMeta,
  setKeyStoreReady,
  setKeyServiceSessionId,
  setStoreId,
}: UseAppFlowsParams): UseAppFlowsReturn {
  const requestKeyService = useCallback(
    async <T extends KeyServiceRequest['type']>(
      request: KeyServiceRequestByType<T>
    ): Promise<KeyServiceResponseByType<T>> => {
      if (!services) {
        throw new Error('Services not initialized');
      }
      return services.keyService.request(request) as Promise<KeyServiceResponseByType<T>>;
    },
    [services]
  );

  const requestKeyServiceFor = useCallback(
    async <T extends KeyServiceRequest['type']>(
      targetServices: Services,
      request: KeyServiceRequestByType<T>
    ): Promise<KeyServiceResponseByType<T>> => {
      return targetServices.keyService.request(request) as Promise<KeyServiceResponseByType<T>>;
    },
    []
  );

  const switchToStore = useCallback(
    async (targetStoreId: string): Promise<Services> => {
      if (servicesRef.current && servicesRef.current.storeId === targetStoreId) {
        return servicesRef.current;
      }
      return await new Promise<Services>((resolve, reject) => {
        pendingInitResolver.current = { resolve, reject, targetStoreId };
        setStoreId(targetStoreId);
      });
    },
    [servicesRef, pendingInitResolver, setStoreId]
  );

  const completeOnboarding = useCallback(
    async ({ password }: { password: string }) => {
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
      const { userMeta, sessionId } = await completeOnboardingFlow({
        services,
        storeId: parsedStoreId.data,
        password,
        requestKeyService,
        toUserId,
      });
      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);
      saveMeta(userMeta);
      setUserMeta(userMeta);
      setSession({ status: 'ready', userId: userMeta.userId });
    },
    [services, storeId, requestKeyService, setKeyStoreReady, setKeyServiceSessionId, setUserMeta, setSession]
  );

  const unlock = useCallback(
    async ({ password }: { password: string }) => {
      if (!services) throw new Error('Services not initialized');
      const meta = loadMeta();
      if (!meta) throw new Error('No user metadata found');
      const sessionId = await unlockFlow({
        services,
        password,
        requestKeyService,
      });
      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);
      saveMeta(meta);
      setUserMeta(meta);
      setSession({ status: 'ready', userId: meta.userId });
    },
    [services, requestKeyService, setKeyStoreReady, setKeyServiceSessionId, setUserMeta, setSession]
  );

  const exportKeyVaultBackup = useCallback(
    async ({ password }: { password: string }): Promise<string> => {
      if (!services) throw new Error('Services not initialized');
      if (!keyServiceSessionId) {
        throw new Error('Key service session missing; unlock first.');
      }
      return exportKeyVaultBackupFlow({
        sessionId: keyServiceSessionId,
        password,
        sessionUserId: session.status === 'ready' ? session.userId : undefined,
        requestKeyService,
      });
    },
    [services, keyServiceSessionId, session, requestKeyService]
  );

  const resetLocalState = useCallback(async (): Promise<void> => {
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
    clearMeta();
    setKeyStoreReady(false);
    setKeyServiceSessionId(null);
    const nextStoreId = uuidv4();
    localStorage.setItem(STORE_ID_KEY, nextStoreId);
    window.location.reload();
  }, [services, storeId, setKeyStoreReady, setKeyServiceSessionId]);

  const rebuildProjections = useCallback(async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    const goalCtx = services.contexts.goals;
    const projectCtx = services.contexts.projects;
    if (!goalCtx || !projectCtx) return;
    await goalCtx.goalProjection.resetAndRebuild();
    await projectCtx.projectProjection.resetAndRebuild();
  }, [services]);

  const resetSyncState = useCallback(async (): Promise<void> => {
    if (!services) throw new Error('Services not initialized');
    services.syncEngine.stop();
    await services.syncEngine.resetSyncState();
    services.syncEngine.start();
    await services.syncEngine.syncOnce().catch(() => undefined);
  }, [services]);

  const restoreBackup = useCallback(
    async ({
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
      const { targetUserId, targetServices, sessionId } = await restoreBackupFlow({
        currentStoreId: storeId,
        password,
        backup,
        db,
        requestKeyServiceFor,
        getTargetServices: async (targetUserIdValue) => {
          if (servicesRef.current?.storeId === targetUserIdValue) {
            return servicesRef.current;
          }
          return switchToStore(targetUserIdValue);
        },
        toUserId,
      });

      setKeyStoreReady(true);
      setKeyServiceSessionId(sessionId);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORE_ID_KEY, targetUserId);
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
    },
    [
      services,
      storeId,
      servicesRef,
      switchToStore,
      requestKeyServiceFor,
      setKeyStoreReady,
      setKeyServiceSessionId,
      setUserMeta,
      setSession,
    ]
  );

  return {
    completeOnboarding,
    unlock,
    exportKeyVaultBackup,
    resetLocalState,
    rebuildProjections,
    resetSyncState,
    restoreBackup,
  };
}
