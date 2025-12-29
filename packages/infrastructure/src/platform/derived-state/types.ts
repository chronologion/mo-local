import type {
  CommitCursor,
  EffectiveCursor,
  ProjectionOrdering,
} from '@mo/eventstore-core';

export type ProjectionId = string;
export type ScopeKey = string;

export const ProjectionPhases = {
  idle: 'idle',
  catchingUp: 'catchingUp',
  rebuilding: 'rebuilding',
  failed: 'failed',
} as const;

export type ProjectionPhase =
  (typeof ProjectionPhases)[keyof typeof ProjectionPhases];

export type ProjectionStatus = Readonly<{
  projectionId: ProjectionId;
  ordering: ProjectionOrdering;
  /** Latest fully applied cursor in the chosen ordering (commit vs effective). */
  lastApplied: CommitCursor | EffectiveCursor | null;
  /** Useful for UI “indexing…” indicators; not a correctness contract. */
  phase: ProjectionPhase;
}>;

export interface ProjectionRuntimePort {
  /** Resolves once the runtime has initialized and can serve reads. */
  whenReady(): Promise<void>;

  /**
   * Resolves once derived state has caught up to “now” for the runtime’s target ordering.
   * This is the freshness barrier that all read-model adapters must use.
   */
  flush(): Promise<void>;

  /**
   * Called by the sync engine when remote events arrive while local pending exists.
   * Must deterministically rebuild all derived state that depends on `effectiveTotalOrder`.
   */
  onRebaseRequired(): Promise<void>;

  /** Debug/status only; not a correctness dependency. */
  getStatuses(): Promise<ReadonlyArray<ProjectionStatus>>;
}

export interface IndexingPort {
  /** Ensure the index exists (build incrementally if missing/outdated). */
  ensureBuilt(indexId: string): Promise<void>;
  /** Debug/status only. */
  status(
    indexId: string
  ): Promise<Readonly<{ indexId: string; phase: IndexBuildPhase }>>;
}

export const IndexBuildPhases = {
  missing: 'missing',
  building: 'building',
  ready: 'ready',
  failed: 'failed',
} as const;

export type IndexBuildPhase =
  (typeof IndexBuildPhases)[keyof typeof IndexBuildPhases];

export interface ProjectionProcessorPort {
  readonly ordering: ProjectionOrdering;
}
