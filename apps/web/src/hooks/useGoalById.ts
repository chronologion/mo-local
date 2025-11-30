import { useEffect, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import type { GoalListItem } from '../services/GoalQueries';

export const useGoalById = (goalId: string | null) => {
  const { services } = useApp();
  const [goal, setGoal] = useState<GoalListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goalId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    services.goalQueries
      .getGoalById(goalId)
      .then((result) => {
        if (!cancelled) setGoal(result);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goalId, services.goalQueries]);

  return { goal, loading, error };
};
