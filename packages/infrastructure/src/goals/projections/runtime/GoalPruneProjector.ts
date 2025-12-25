import type { Store } from '@livestore/livestore';

export class GoalPruneProjector {
  constructor(private readonly store: Store) {}

  pruneProcessedEvents(processedUpTo: number): void {
    if (!Number.isFinite(processedUpTo) || processedUpTo <= 0) return;
    this.store.query({
      query: 'DELETE FROM goal_events WHERE sequence <= ?',
      bindValues: [processedUpTo],
    });
  }
}
