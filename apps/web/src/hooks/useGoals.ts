import { useCallback, useEffect, useState } from 'react';
import { GoalListItem } from '../services/GoalQueries';
import { useApp } from '../providers/AppProvider';
import { tables } from '../livestore/schema';

export const useGoals = () => {
  const { services } = useApp();
  const [goals, setGoals] = useState<GoalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await services.goalQueries.listGoals();
      setGoals(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [services.goalQueries]);

  useEffect(() => {
    refresh();
    const sub = services.store.subscribe(tables.goal_events.count(), () => {
      void refresh();
    });
    return () => {
      sub?.();
    };
  }, [refresh, services.store]);

  return { goals, loading, error, refresh };
};
