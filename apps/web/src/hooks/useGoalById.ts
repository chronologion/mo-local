import { useEffect, useState } from 'react';
import { useApp } from '../providers/AppProvider';
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
        const result = await services.goalQueryBus.dispatch({
          type: 'GetGoalById',
          goalId,
        });
        if (!cancelled) {
          if (Array.isArray(result)) {
            throw new Error('Invalid query result');
          }
          setGoal(result);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    let unsubscribe: (() => void) | undefined;
    const wireSubscription = async () => {
      await services.goalProjection.whenReady();
      if (cancelled) return;
      unsubscribe = services.goalProjection.subscribe(() => {
        void refresh();
      });
    };
    setLoading(true);
    setError(null);
    void refresh();
    void wireSubscription();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [goalId, services.goalProjection, services.goalQueryBus]);

  return { goal, loading, error };
};
