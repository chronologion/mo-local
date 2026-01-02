import type {
  ChangeHint,
  SqliteBatchResult,
  SqliteDbPort,
  SqliteStatement,
  SqliteValue,
} from '@mo/eventstore-web';
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

const normalizeSql = (sql: string): string =>
  sql.replace(/\s+/g, ' ').trim().toUpperCase();

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

export class TestDerivedStateDb implements SqliteDbPort {
  private readonly projectionCache = new Map<string, ProjectionCacheRow>();
  private readonly indexArtifacts = new Map<string, IndexArtifactRow>();

  getProjectionCacheRow(
    projectionId: string,
    scopeKey: string
  ): ProjectionCacheRow | null {
    return this.projectionCache.get(`${projectionId}:${scopeKey}`) ?? null;
  }

  setProjectionCacheRow(row: ProjectionCacheRow): void {
    this.projectionCache.set(`${row.projection_id}:${row.scope_key}`, row);
  }

  getIndexArtifactRow(
    indexId: string,
    scopeKey: string
  ): IndexArtifactRow | null {
    return this.indexArtifacts.get(`${indexId}:${scopeKey}`) ?? null;
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = normalizeSql(sql);
    if (normalized.includes('FROM PROJECTION_CACHE')) {
      if (normalized.includes('WHERE PROJECTION_ID = ? AND SCOPE_KEY = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        const row = this.getProjectionCacheRow(projectionId, scopeKey);
        return row ? ([row] as unknown as T[]) : [];
      }
      if (normalized.includes('WHERE PROJECTION_ID = ?')) {
        const projectionId = toString(params[0] as SqliteValue);
        const rows = [...this.projectionCache.values()].filter(
          (row) => row.projection_id === projectionId
        );
        return rows as unknown as T[];
      }
    }

    if (normalized.includes('FROM INDEX_ARTIFACTS')) {
      if (normalized.includes('WHERE INDEX_ID = ? AND SCOPE_KEY = ?')) {
        const indexId = toString(params[0] as SqliteValue);
        const scopeKey = toString(params[1] as SqliteValue);
        const row = this.getIndexArtifactRow(indexId, scopeKey);
        if (!row) return [];
        const mapped = {
          index_id: row.index_id,
          scope_key: row.scope_key,
          artifact_version: row.artifact_version,
          artifact_encrypted: row.artifact_encrypted,
          last_global_seq: row.last_global_seq,
          last_pending_commit_seq: row.last_pending_commit_seq,
          written_at: row.written_at,
        };
        return [mapped] as unknown as T[];
      }
    }

    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<void> {
    const normalized = normalizeSql(sql);
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
      this.setProjectionCacheRow(row);
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

  async batch(
    statements: ReadonlyArray<SqliteStatement>
  ): Promise<ReadonlyArray<SqliteBatchResult>> {
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

  subscribeToTables(
    _tables: ReadonlyArray<string>,
    _listener: () => void
  ): () => void {
    return () => undefined;
  }

  subscribeToChanges?(
    _tables: ReadonlyArray<string>,
    _listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): () => void {
    return () => undefined;
  }
}
