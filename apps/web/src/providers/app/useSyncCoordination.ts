import { useEffect } from 'react';
import type { Services } from './types';

type UseSyncCoordinationParams = {
  services: Services | null;
  keyStoreReady: boolean;
  sessionStatus: string;
  remoteAuthStatus: string;
};

export function useSyncCoordination({
  services,
  keyStoreReady,
  sessionStatus,
  remoteAuthStatus,
}: UseSyncCoordinationParams): void {
  useEffect(() => {
    if (!services || sessionStatus !== 'ready' || !keyStoreReady) return;
    if (remoteAuthStatus !== 'connected') {
      services.syncEngine.stop();
      return;
    }
    services.syncEngine.start();
    void services.syncEngine.syncOnce().catch(() => undefined);
    return () => {
      services.syncEngine.stop();
    };
  }, [services, keyStoreReady, sessionStatus, remoteAuthStatus]);
}
