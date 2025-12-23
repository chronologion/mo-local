import type { Store } from '@livestore/livestore';

export class ProjectPruneProjector {
  constructor(private readonly store: Store) {}

  pruneProcessedEvents(threshold: number): void {
    if (!Number.isFinite(threshold) || threshold <= 0) return;
    this.store.query({
      query: 'DELETE FROM project_events WHERE sequence <= ?',
      bindValues: [threshold],
    });
  }
}
