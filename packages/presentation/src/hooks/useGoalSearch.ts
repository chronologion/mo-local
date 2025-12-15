import { useEffect, useState } from 'react';
import type { GoalListItemDto as GoalListItem } from '@mo/application';
import { SearchGoalsQuery } from '@mo/application';
import { useInterface } from '../context';

type Filters = { slice?: string; month?: string; priority?: string };

/**
 * Search goals via the projection's FTS index.
 */
export const useGoalSearch = (term: string, filter?: Filters) => {
  const { services } = useInterface();
  const [results, setResults] = useState<GoalListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await services.goalQueryBus.dispatch(
          new SearchGoalsQuery(term, filter)
        );
        if (cancelled) return;
        if (!Array.isArray(list)) {
          throw new Error('Invalid search result');
        }
        setResults(list as GoalListItem[]);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (term.trim().length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    void run();
    let unsubscribe: (() => void) | undefined;
    const wireSubscription = async () => {
      await services.goalProjection.whenReady();
      if (cancelled) return;
      unsubscribe = services.goalProjection.subscribe(() => {
        void run();
      });
    };
    void wireSubscription();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [filter, services.goalProjection, services.goalQueryBus, term]);

  return { results, loading, error };
};
