export type Unsubscribe = () => void;

/**
 * Stable partition key for the unified `events` table.
 * This must never be renamed once persisted.
 */
export const AggregateTypes = {
  goal: 'goal',
  project: 'project',
} as const;

export type AggregateType =
  (typeof AggregateTypes)[keyof typeof AggregateTypes];

export type CommitCursor = Readonly<{
  commitSequence: number;
  eventId: string;
  version: number;
}>;

export type SyncCursor = Readonly<{
  globalSequence: number;
}>;

/**
 * Cursor type for `effectiveTotalOrder` consumption:
 * - first advance `globalSequence` (synced region),
 * - then advance `pendingCommitSequence` (pending region, where `globalSequence` is null).
 */
export type EffectiveCursor = Readonly<{
  globalSequence: number;
  pendingCommitSequence: number;
}>;

export const ProjectionOrderings = {
  effectiveTotalOrder: 'effectiveTotalOrder',
  commitSequence: 'commitSequence',
} as const;

export type ProjectionOrdering =
  (typeof ProjectionOrderings)[keyof typeof ProjectionOrderings];

export const CursorComparisons = {
  before: 'before',
  equal: 'equal',
  after: 'after',
} as const;

export type CursorComparison =
  (typeof CursorComparisons)[keyof typeof CursorComparisons];

export type EventRecord = Readonly<{
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array; // encrypted ciphertext (opaque)
  version: number; // per-aggregate version (AAD binding)
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
  epoch: number | null;
  keyringUpdate: Uint8Array | null;

  /** Monotonic local commit order (stable on-device). */
  commitSequence: number;
  /** Server global sequence once synced; null for local-only pending events. */
  globalSequence: number | null;
}>;

export type EventFilter = Readonly<{
  aggregateId?: string;
  eventType?: string;
  /** Process new local commits since this local commitSequence. */
  sinceCommitSequence?: number;
  /** Replay in server order since this global sequence (synced events only). */
  sinceGlobalSequence?: number;
  limit?: number;
}>;

export const EventRecordDerivedKeys = {
  commitSequence: 'commitSequence',
  globalSequence: 'globalSequence',
} as const;

export type EventRecordDerivedKey =
  (typeof EventRecordDerivedKeys)[keyof typeof EventRecordDerivedKeys];

export interface EventLogPort {
  append(
    events: ReadonlyArray<Omit<EventRecord, EventRecordDerivedKey>>
  ): Promise<ReadonlyArray<EventRecord>>;
  read(filter: EventFilter): Promise<ReadonlyArray<EventRecord>>;
}

export interface ReactiveQueryPort<T> {
  get(): Promise<T>;
  subscribe(callback: (value: T) => void): Unsubscribe;
}

export const PlatformErrorCodes = {
  DbOwnershipError: 'DbOwnershipError',
  DbLockedError: 'DbLockedError',
  WorkerProtocolError: 'WorkerProtocolError',
  CanceledError: 'CanceledError',
  TimeoutError: 'TimeoutError',
  TransactionAbortedError: 'TransactionAbortedError',
  ConstraintViolationError: 'ConstraintViolationError',
  MigrationError: 'MigrationError',
  DecryptionError: 'DecryptionError',
  IndexCorruptionError: 'IndexCorruptionError',
  SyncConflictError: 'SyncConflictError',
} as const;

export type PlatformErrorCode =
  (typeof PlatformErrorCodes)[keyof typeof PlatformErrorCodes];

export type PlatformError = Readonly<{
  code: PlatformErrorCode;
  message: string;
  /**
   * Optional machine-readable context for debugging/telemetry.
   * Must be JSON-serializable (worker boundary safe).
   */
  context?: Readonly<Record<string, unknown>>;
}>;

export function compareCommitCursor(
  a: CommitCursor,
  b: CommitCursor
): CursorComparison {
  if (a.commitSequence < b.commitSequence) return CursorComparisons.before;
  if (a.commitSequence > b.commitSequence) return CursorComparisons.after;

  if (a.eventId < b.eventId) return CursorComparisons.before;
  if (a.eventId > b.eventId) return CursorComparisons.after;

  if (a.version < b.version) return CursorComparisons.before;
  if (a.version > b.version) return CursorComparisons.after;

  return CursorComparisons.equal;
}

export function compareEffectiveCursor(
  a: EffectiveCursor,
  b: EffectiveCursor
): CursorComparison {
  if (a.globalSequence < b.globalSequence) return CursorComparisons.before;
  if (a.globalSequence > b.globalSequence) return CursorComparisons.after;

  if (a.pendingCommitSequence < b.pendingCommitSequence) {
    return CursorComparisons.before;
  }
  if (a.pendingCommitSequence > b.pendingCommitSequence) {
    return CursorComparisons.after;
  }

  return CursorComparisons.equal;
}

export function commitCursorFromRecord(record: EventRecord): CommitCursor {
  return {
    commitSequence: record.commitSequence,
    eventId: record.id,
    version: record.version,
  };
}

export function advanceEffectiveCursor(
  cursor: EffectiveCursor,
  record: EventRecord
): EffectiveCursor {
  if (record.globalSequence !== null) {
    return {
      globalSequence: record.globalSequence,
      pendingCommitSequence: cursor.pendingCommitSequence,
    };
  }

  return {
    globalSequence: cursor.globalSequence,
    pendingCommitSequence: record.commitSequence,
  };
}
