export const SyncDirections = {
  pull: 'pull',
  push: 'push',
} as const;

export type SyncDirection = (typeof SyncDirections)[keyof typeof SyncDirections];

export const SyncPauseReasons = {
  user: 'user',
  offline: 'offline',
  backoff: 'backoff',
} as const;

export type SyncPauseReason = (typeof SyncPauseReasons)[keyof typeof SyncPauseReasons];

export const SyncErrorCodes = {
  network: 'network',
  conflict: 'conflict',
  auth: 'auth',
  server: 'server',
  unknown: 'unknown',
} as const;

export type SyncErrorCode = (typeof SyncErrorCodes)[keyof typeof SyncErrorCodes];

export const SyncStatusKinds = {
  idle: 'idle',
  syncing: 'syncing',
  paused: 'paused',
  error: 'error',
} as const;

export type SyncStatusKind = (typeof SyncStatusKinds)[keyof typeof SyncStatusKinds];

export type SyncError = Readonly<{
  code: SyncErrorCode;
  message: string;
  context?: Readonly<Record<string, unknown>>;
}>;

export type SyncStatus =
  | Readonly<{
      kind: typeof SyncStatusKinds.idle;
      lastSuccessAt: number | null;
      lastError: SyncError | null;
    }>
  | Readonly<{
      kind: typeof SyncStatusKinds.syncing;
      direction: SyncDirection;
      lastSuccessAt: number | null;
      lastError: SyncError | null;
    }>
  | Readonly<{
      kind: typeof SyncStatusKinds.paused;
      reason: SyncPauseReason;
      lastSuccessAt: number | null;
      lastError: SyncError | null;
    }>
  | Readonly<{
      kind: typeof SyncStatusKinds.error;
      error: SyncError;
      retryAt: number | null;
      lastSuccessAt: number | null;
    }>;

export const SyncPushConflictReasons = {
  serverAhead: 'server_ahead',
  serverBehind: 'server_behind',
} as const;

export type SyncPushConflictReason = (typeof SyncPushConflictReasons)[keyof typeof SyncPushConflictReasons];

export type SyncPullResponseV1 = Readonly<{
  head: number;
  events: ReadonlyArray<{
    globalSequence: number;
    eventId: string;
    recordJson: string;
  }>;
  hasMore: boolean;
  nextSince: number | null;
}>;

export type SyncPushRequestV1 = Readonly<{
  storeId: string;
  expectedHead: number;
  events: ReadonlyArray<{ eventId: string; recordJson: string }>;
}>;

export type SyncPushOkResponseV1 = Readonly<{
  ok: true;
  head: number;
  assigned: ReadonlyArray<{ eventId: string; globalSequence: number }>;
}>;

export type SyncPushConflictResponseV1 = Readonly<{
  ok: false;
  head: number;
  reason: SyncPushConflictReason;
  missing?: SyncPullResponseV1['events'];
}>;

export interface SyncTransportPort {
  push(request: SyncPushRequestV1): Promise<SyncPushOkResponseV1 | SyncPushConflictResponseV1>;
  pull(params: { storeId: string; since: number; limit: number; waitMs?: number }): Promise<SyncPullResponseV1>;
  ping(): Promise<void>;
}

export type SyncRecord = Readonly<{
  recordVersion: 1;
  aggregateType: string;
  aggregateId: string;
  epoch: number | null;
  version: number;
  payloadCiphertext: string;
  keyringUpdate: string | null;
}>;

export type SyncEngineOptions = Readonly<{
  db: import('@mo/eventstore-web').SqliteDbPort;
  transport: SyncAbortableTransportPort;
  storeId: string;
  onRebaseRequired: () => Promise<void>;
  pendingVersionRewriter?: PendingVersionRewriterPort;
  materializer: SyncRecordMaterializerPort;
  pullLimit?: number;
  pullWaitMs?: number;
  pullIntervalMs?: number;
  pushIntervalMs?: number;
  pushFallbackIntervalMs?: number;
  pushBatchSize?: number;
  maxPushRetries?: number;
  onStatusChange?: (status: SyncStatus) => void;
}>;

export type PendingVersionRewriteRequest = Readonly<{
  aggregateType: string;
  aggregateId: string;
  fromVersionInclusive: number;
}>;

export type PendingVersionRewriteResult = Readonly<{
  aggregateType: string;
  aggregateId: string;
  fromVersionInclusive: number;
  shiftedCount: number;
  oldMaxVersion: number | null;
  newMaxVersion: number | null;
}>;

export interface PendingVersionRewriterPort {
  rewritePendingVersions(request: PendingVersionRewriteRequest): Promise<PendingVersionRewriteResult>;
}

export interface SyncAbortableTransportPort extends SyncTransportPort {
  setAbortSignal(direction: SyncDirection, signal: AbortSignal | null): void;
}

export type MaterializedEventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  epoch: number | null;
}>;

export interface SyncRecordMaterializerPort {
  materializeRemoteEvent(input: { eventId: string; recordJson: string; globalSequence: number }): Promise<{
    eventRow: MaterializedEventRow;
  }>;
}
