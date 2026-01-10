import { useEffect, useRef, useState } from 'react';
import { startServicesLifecycle, type DebugInfo, type PendingInitResolver } from './servicesLifecycle';
import type { Services } from './types';

type MutableRef<T> = { current: T };

type UseServicesLifecycleParams = {
  storeId: string | null;
  keyStoreReady: boolean;
  sessionStatus: string;
};

type UseServicesLifecycleReturn = {
  services: Services | null;
  servicesConfig: { storeId: string } | null;
  servicesRef: MutableRef<Services | null>;
  pendingInitResolver: MutableRef<PendingInitResolver | null>;
  debugInfo: DebugInfo | null;
  initError: string | null;
  resetSyncRef: MutableRef<(() => void) | null>;
};

export function useServicesLifecycle({
  storeId,
  keyStoreReady,
  sessionStatus,
}: UseServicesLifecycleParams): UseServicesLifecycleReturn {
  const [services, setServices] = useState<Services | null>(null);
  const [servicesConfig, setServicesConfig] = useState<{
    storeId: string;
  } | null>(null);
  const servicesRef = useRef<Services | null>(null);
  const pendingInitResolver = useRef<PendingInitResolver | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const sagaBootstrappedRef = useRef<Set<string>>(new Set());
  const publisherStartedRef = useRef<Set<string>>(new Set());
  const resetSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!storeId) return;
    return startServicesLifecycle({
      storeId,
      setServices,
      setServicesConfig,
      setDebugInfo,
      setInitError,
      servicesRef,
      pendingInitResolver,
      onResetSync: () => {
        resetSyncRef.current?.();
      },
    });
  }, [storeId]);

  useEffect(() => {
    if (!services || sessionStatus !== 'ready' || !keyStoreReady) return;
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
  }, [services, keyStoreReady, sessionStatus]);

  return {
    services,
    servicesConfig,
    servicesRef,
    pendingInitResolver,
    debugInfo,
    initError,
    resetSyncRef,
  };
}
