import { useCallback, useEffect, useState } from 'react';
import type { ProjectListItem } from '@mo/infrastructure/browser';
import { useApp } from '../providers/AppProvider';

export const useProjects = (filter?: {
  status?: string;
  goalId?: string | null;
}) => {
  const { services } = useApp();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await services.projectQueryBus.dispatch({
        type: 'ListProjects',
        filter,
      });
      if (!Array.isArray(list)) {
        throw new Error('Invalid query result');
      }
      setProjects(list as ProjectListItem[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filter, services.projectQueryBus]);

  useEffect(() => {
    refresh();
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const wireSubscription = async () => {
      await services.projectProjection.whenReady();
      if (cancelled) return;
      unsubscribe = services.projectProjection.subscribe(() => {
        void refresh();
      });
    };
    void wireSubscription();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh, services.projectProjection]);

  return { projects, loading, error, refresh };
};
