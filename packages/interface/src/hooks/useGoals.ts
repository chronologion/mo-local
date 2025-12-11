import { useCallback, useEffect, useState } from 'react';
import type { GoalListItemDto as GoalListItem } from '@mo/interface';
import { ListGoalsQuery } from '@mo/application';
import { useInterface } from '../context';

export const useGoals = () => {
  const { services } = useInterface();
  const [goals, setGoals] = useState<GoalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await services.goalQueryBus.dispatch(
        new ListGoalsQuery(undefined)
      );
      if (!Array.isArray(list)) {
        throw new Error('Invalid query result');
      }
      setGoals(list as GoalListItem[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [services.goalQueryBus]);

  useEffect(() => {
    refresh();
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const wireSubscription = async () => {
      await services.goalProjection.whenReady();
      if (cancelled) return;
      unsubscribe = services.goalProjection.subscribe(() => {
        void refresh();
      });
    };
    void wireSubscription();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh, services.goalProjection]);

  return { goals, loading, error, refresh };
};
