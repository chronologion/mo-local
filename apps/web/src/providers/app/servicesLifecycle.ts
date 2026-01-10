import { createAppServices } from '../../bootstrap/createAppServices';
import type { Services } from './types';

export type DebugInfo = {
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
};

export type PendingInitResolver = {
  resolve: (svc: Services) => void;
  reject: (error: unknown) => void;
  targetStoreId: string;
};

type MutableRef<T> = { current: T };

export const startServicesLifecycle = (params: {
  storeId: string;
  setServices: (svc: Services | null) => void;
  setServicesConfig: (config: { storeId: string } | null) => void;
  setDebugInfo: (info: DebugInfo | null) => void;
  setInitError: (error: string | null) => void;
  servicesRef: MutableRef<Services | null>;
  pendingInitResolver: MutableRef<PendingInitResolver | null>;
  onResetSync: () => void;
}): (() => void) => {
  const {
    storeId,
    setServices,
    setServicesConfig,
    setDebugInfo,
    setInitError,
    servicesRef,
    pendingInitResolver,
    onResetSync,
  } = params;

  setServices(null);
  setServicesConfig(null);
  setDebugInfo(null);
  servicesRef.current = null;

  const controller = new AbortController();
  const { signal } = controller;
  let unsubscribe: (() => void) | undefined;
  let intervalId: number | undefined;
  let createdServices: Services | null = null;

  void (async () => {
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
            onResetSync();
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
};
