import { useEffect } from 'react';
import type { Services } from './types';

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

type UseDebugWindowParams = {
  services: Services | null;
  resetSyncState: () => Promise<void>;
};

export function useDebugWindow({ services, resetSyncState }: UseDebugWindowParams): void {
  useEffect(() => {
    if (!import.meta.env.DEV || !services) return;

    const debugWindow: DebugWindow = window;
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

    return () => {
      delete debugWindow.__moSyncOnce;
      delete debugWindow.__moPullOnce;
      delete debugWindow.__moPushOnce;
      delete debugWindow.__moSyncStart;
      delete debugWindow.__moSyncStop;
      delete debugWindow.__moPendingCount;
      delete debugWindow.__moSyncStatus;
      delete debugWindow.__moResetSyncState;
    };
  }, [services, resetSyncState]);
}
