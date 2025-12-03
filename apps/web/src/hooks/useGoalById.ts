import { useEffect, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import { tables } from '@mo/infrastructure/browser';
import type { GoalListItem } from '@mo/infrastructure/browser';

export const useGoalById = (goalId: string | null) => {
  const { services } = useApp();
  const [goal, setGoal] = useState<GoalListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goalId) return;
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await services.goalQueries.getGoalById(goalId);
        if (!cancelled) setGoal(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    setError(null);
    void refresh();
    const sub = services.store.subscribe(tables.goal_events.count(), () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      sub?.();
    };
  }, [goalId, services.goalQueries, services.store]);

  return { goal, loading, error };
};
