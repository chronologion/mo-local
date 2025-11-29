import { useCallback, useEffect, useState } from 'react';
import { GoalListItem } from '../services/GoalQueries';
import { useApp } from '../providers/AppProvider';

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
  }, [refresh]);

  return { goals, loading, error, refresh };
};
