import type { EncryptedEvent } from '@mo/application';
import type { AggregateType } from '@mo/eventstore-core';
import type { ChangeHint, SqliteBatchResult, SqliteDbPort, SqliteStatement, SqliteValue } from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';

type ProjectionCacheRow = Readonly<{
  projection_id: string;
  scope_key: string;
  cache_version: number;
  cache_encrypted: Uint8Array;
  ordering: string;
  last_global_seq: number;
  last_pending_commit_seq: number;
  last_commit_sequence: number;
  written_at: number;
}>;

type IndexArtifactRow = Readonly<{
  index_id: string;
  scope_key: string;
  artifact_version: number;
  artifact_encrypted: Uint8Array;
  last_global_seq: number;
  last_pending_commit_seq: number;
  written_at: number;
}>;

type ProjectionMetaRow = Readonly<{
  projection_id: string;
  ordering: string;
  last_global_seq: number;
  last_pending_commit_seq: number;
  last_commit_sequence: number;
  phase: string;
  updated_at: number;
}>;

type EventRow = Readonly<{
  commit_sequence: number;
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

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toUpperCase();

const toString = (value: SqliteValue): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Expected string param, got ${typeof value}`);
};

const toNumber = (value: SqliteValue): number => {
  if (typeof value === 'number') return value;
  throw new Error(`Expected number param, got ${typeof value}`);
};

const toUint8Array = (value: SqliteValue): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  throw new Error(`Expected Uint8Array param, got ${typeof value}`);
};

export class TestProjectionDb implements SqliteDbPort {
  private readonly events: EventRow[] = [];
  private readonly syncEventMap = new Map<string, number>();
  private nextCommitSequence = 1;
  private readonly projectionMeta = new Map<string, ProjectionMetaRow>();
  private readonly projectionCache = new Map<string, ProjectionCacheRow>();
  private readonly indexArtifacts = new Map<string, IndexArtifactRow>();

  insertEvent(
    aggregateType: AggregateType,
    event: EncryptedEvent,
    options?: { commitSequence?: number; globalSequence?: number }
  ): number {
    const commitSequence = options?.commitSequence ?? this.nextCommitSequence;
    this.nextCommitSequence = Math.max(this.nextCommitSequence, commitSequence + 1);
    this.events.push({
      commit_sequence: commitSequence,
      id: event.id,
      aggregate_type: aggregateType,
      aggregate_id: event.aggregateId,
      event_type: event.eventType,
      payload_encrypted: event.payload,
      keyring_update: event.keyringUpdate ?? null,
      version: event.version,
      occurred_at: event.occurredAt,
      actor_id: event.actorId ?? null,
      causation_id: event.causationId ?? null,
      correlation_id: event.correlationId ?? null,
      epoch: event.epoch ?? null,
    });

    if (options?.globalSequence !== undefined) {
      this.syncEventMap.set(event.id, options.globalSequence);
    }
    return commitSequence;
  }

  setGlobalSequence(eventId: string, globalSequence: number): void {
    this.syncEventMap.set(eventId, globalSequence);
  }

  getProjectionCacheRow(projectionId: string, scopeKey: string): ProjectionCacheRow | null {
    return this.projectionCache.get(`${projectionId}:${scopeKey}`) ?? null;
  }

  getIndexArtifactRow(indexId: string, scopeKey: string): IndexArtifactRow | null {
    return this.indexArtifacts.get(`${indexId}:${scopeKey}`) ?? null;
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = normalizeSql(sql);
    if (normalized.includes('FROM PROJECTION_META')) {
      if (normalized.includes('WHERE PROJECTION_ID = ?')) {
        const id = toString(params[0] as SqliteValue);
        const row = this.projectionMeta.get(id);
        return row ? ([row] as unknown as T[]) : ([] as unknown as T[]);
      }
      return [...this.projectionMeta.values()] as unknown as T[];
    }

    if (normalized.includes('FROM PROJECTION_CACHE')) {
      if (normalized.includes('WHERE PROJECTION_ID = ? AND SCOPE_KEY = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        const row = this.getProjectionCacheRow(projectionId, scopeKey);
        return row ? ([row] as unknown as T[]) : ([] as unknown as T[]);
      }
      if (normalized.includes('WHERE PROJECTION_ID = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        const rows = [...this.projectionCache.values()].filter((row) => row.projection_id === projectionId);
        return rows as unknown as T[];
      }
    }

    if (normalized.includes('FROM INDEX_ARTIFACTS')) {
      if (normalized.includes('WHERE INDEX_ID = ? AND SCOPE_KEY = ?')) {
        const indexId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        const row = this.getIndexArtifactRow(indexId, scopeKey);
        if (!row) return [] as unknown as T[];
        return [row] as unknown as T[];
      }
    }

    if (normalized.includes('FROM EVENTS E') && normalized.includes('LEFT JOIN SYNC_EVENT_MAP')) {
      const aggregateType = toString(params[0] as SqliteValue);
      const cursorGlobal = toNumber(params[1] as SqliteValue);
      const cursorPending = toNumber(params[2] as SqliteValue);
      const cursorPendingFallback = toNumber(params[3] as SqliteValue);
      const limit = toNumber(params[4] as SqliteValue);
      const pendingCursor = Math.max(cursorPending, cursorPendingFallback);

      const rows = this.events
        .filter((row) => row.aggregate_type === aggregateType)
        .map((row) => ({
          ...row,
          global_seq: this.syncEventMap.get(row.id) ?? null,
        }))
        .filter((row) => {
          if (row.global_seq !== null) {
            return row.global_seq > cursorGlobal && row.commit_sequence > pendingCursor;
          }
          return row.commit_sequence > pendingCursor;
        })
        .sort((a, b) => {
          const aPending = a.global_seq === null ? 1 : 0;
          const bPending = b.global_seq === null ? 1 : 0;
          if (aPending !== bPending) return aPending - bPending;
          if (a.global_seq !== null && b.global_seq !== null && a.global_seq !== b.global_seq) {
            return a.global_seq - b.global_seq;
          }
          return a.commit_sequence - b.commit_sequence;
        })
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          aggregate_id: row.aggregate_id,
          event_type: row.event_type,
          payload_encrypted: row.payload_encrypted,
          epoch: row.epoch,
          keyring_update: row.keyring_update,
          version: row.version,
          occurred_at: row.occurred_at,
          actor_id: row.actor_id,
          causation_id: row.causation_id,
          correlation_id: row.correlation_id,
          commit_sequence: row.commit_sequence,
          global_seq: row.global_seq,
        }));

      return rows as unknown as T[];
    }

    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(sql: string, params: ReadonlyArray<SqliteValue> = []): Promise<void> {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('INSERT INTO PROJECTION_META')) {
      const [projectionId, ordering, lastGlobalSeq, lastPendingCommitSeq, lastCommitSequence, phase, updatedAt] =
        params as [string, string, number, number, number, string, number];
      this.projectionMeta.set(projectionId, {
        projection_id: projectionId,
        ordering,
        last_global_seq: Number(lastGlobalSeq),
        last_pending_commit_seq: Number(lastPendingCommitSeq),
        last_commit_sequence: Number(lastCommitSequence),
        phase,
        updated_at: Number(updatedAt),
      });
      return;
    }

    if (normalized.startsWith('DELETE FROM PROJECTION_META')) {
      const projectionId = toString(params[0] as SqliteValue);
      this.projectionMeta.delete(projectionId);
      return;
    }

    if (normalized.startsWith('INSERT INTO PROJECTION_CACHE')) {
      const row: ProjectionCacheRow = {
        projection_id: toString(params[0] as SqliteValue),
        scope_key: toString(params[1] as SqliteValue),
        cache_version: toNumber(params[2] as SqliteValue),
        cache_encrypted: toUint8Array(params[3] as SqliteValue),
        ordering: toString(params[4] as SqliteValue),
        last_global_seq: toNumber(params[5] as SqliteValue),
        last_pending_commit_seq: toNumber(params[6] as SqliteValue),
        last_commit_sequence: toNumber(params[7] as SqliteValue),
        written_at: toNumber(params[8] as SqliteValue),
      };
      this.projectionCache.set(`${row.projection_id}:${row.scope_key}`, row);
      return;
    }

    if (normalized.startsWith('DELETE FROM PROJECTION_CACHE')) {
      if (normalized.includes('WHERE PROJECTION_ID = ? AND SCOPE_KEY = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        this.projectionCache.delete(`${projectionId}:${scopeKey}`);
        return;
      }
      if (normalized.includes('WHERE PROJECTION_ID = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        for (const key of [...this.projectionCache.keys()]) {
          if (key.startsWith(`${projectionId}:`)) {
            this.projectionCache.delete(key);
          }
        }
        return;
      }
    }

    if (normalized.startsWith('INSERT INTO INDEX_ARTIFACTS')) {
      const row: IndexArtifactRow = {
        index_id: toString(params[0] as SqliteValue),
        scope_key: toString(params[1] as SqliteValue),
        artifact_version: toNumber(params[2] as SqliteValue),
        artifact_encrypted: toUint8Array(params[3] as SqliteValue),
        last_global_seq: toNumber(params[4] as SqliteValue),
        last_pending_commit_seq: toNumber(params[5] as SqliteValue),
        written_at: toNumber(params[6] as SqliteValue),
      };
      this.indexArtifacts.set(`${row.index_id}:${row.scope_key}`, row);
      return;
    }

    if (normalized.startsWith('DELETE FROM INDEX_ARTIFACTS')) {
      if (normalized.includes('WHERE INDEX_ID = ? AND SCOPE_KEY = ?')) {
        const indexId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        this.indexArtifacts.delete(`${indexId}:${scopeKey}`);
        return;
      }
      if (normalized.includes('WHERE INDEX_ID = ?')) {
        const indexId = toString(params[0] as SqliteValue);
        for (const key of [...this.indexArtifacts.keys()]) {
          if (key.startsWith(`${indexId}:`)) {
            this.indexArtifacts.delete(key);
          }
        }
        return;
      }
    }

    throw new Error(`Unhandled execute: ${sql}`);
  }

  async batch(statements: ReadonlyArray<SqliteStatement>): Promise<ReadonlyArray<SqliteBatchResult>> {
    const results: SqliteBatchResult[] = [];
    for (const statement of statements) {
      if (statement.kind === SqliteStatementKinds.execute) {
        await this.execute(statement.sql, statement.params ?? []);
        results.push({ kind: SqliteStatementKinds.execute });
        continue;
      }
      const rows = await this.query(statement.sql, statement.params ?? []);
      results.push({ kind: SqliteStatementKinds.query, rows });
    }
    return results;
  }

  subscribeToTables(_tables: ReadonlyArray<string>, _listener: () => void): () => void {
    return () => undefined;
  }

  subscribeToChanges?(
    _tables: ReadonlyArray<string>,
    _listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): () => void {
    return () => undefined;
  }
}
