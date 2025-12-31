import type { EffectiveCursor, ProjectionOrdering } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import type { ProjectionId, ScopeKey } from '../types';

export type ProjectionCacheRecord = Readonly<{
  projectionId: ProjectionId;
  scopeKey: ScopeKey;
  cacheVersion: number;
  cacheEncrypted: Uint8Array;
  ordering: ProjectionOrdering;
  lastEffectiveCursor: EffectiveCursor;
  lastCommitSequence: number;
  writtenAt: number;
}>;

export class ProjectionCacheStore {
  constructor(private readonly db: SqliteDbPort) {}

  async get(
    projectionId: ProjectionId,
    scopeKey: ScopeKey
  ): Promise<ProjectionCacheRecord | null> {
    const rows = await this.db.query<
      Readonly<{
        projection_id: string;
        scope_key: string;
        cache_version: number;
        cache_encrypted: Uint8Array;
        ordering: string;
        last_global_seq: number;
        last_pending_commit_seq: number;
        last_commit_sequence: number;
        written_at: number;
      }>
    >(
      `
        SELECT
          projection_id,
          scope_key,
          cache_version,
          cache_encrypted,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          written_at
        FROM projection_cache
        WHERE projection_id = ? AND scope_key = ?
        LIMIT 1
      `,
      [projectionId, scopeKey]
    );

    const row = rows[0];
    if (!row) return null;
    return {
      projectionId: row.projection_id,
      scopeKey: row.scope_key,
      cacheVersion: Number(row.cache_version),
      cacheEncrypted: row.cache_encrypted,
      ordering: row.ordering as ProjectionOrdering,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      lastCommitSequence: Number(row.last_commit_sequence),
      writtenAt: Number(row.written_at),
    };
  }

  async listByProjection(
    projectionId: ProjectionId
  ): Promise<ReadonlyArray<ProjectionCacheRecord>> {
    const rows = await this.db.query<
      Readonly<{
        projection_id: string;
        scope_key: string;
        cache_version: number;
        cache_encrypted: Uint8Array;
        ordering: string;
        last_global_seq: number;
        last_pending_commit_seq: number;
        last_commit_sequence: number;
        written_at: number;
      }>
    >(
      `
        SELECT
          projection_id,
          scope_key,
          cache_version,
          cache_encrypted,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          written_at
        FROM projection_cache
        WHERE projection_id = ?
      `,
      [projectionId]
    );

    return rows.map((row) => ({
      projectionId: row.projection_id,
      scopeKey: row.scope_key,
      cacheVersion: Number(row.cache_version),
      cacheEncrypted: row.cache_encrypted,
      ordering: row.ordering as ProjectionOrdering,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      lastCommitSequence: Number(row.last_commit_sequence),
      writtenAt: Number(row.written_at),
    }));
  }

  async put(record: ProjectionCacheRecord): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO projection_cache (
          projection_id,
          scope_key,
          cache_version,
          cache_encrypted,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          written_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(projection_id, scope_key) DO UPDATE SET
          cache_version = excluded.cache_version,
          cache_encrypted = excluded.cache_encrypted,
          ordering = excluded.ordering,
          last_global_seq = excluded.last_global_seq,
          last_pending_commit_seq = excluded.last_pending_commit_seq,
          last_commit_sequence = excluded.last_commit_sequence,
          written_at = excluded.written_at
      `,
      [
        record.projectionId,
        record.scopeKey,
        record.cacheVersion,
        record.cacheEncrypted,
        record.ordering,
        record.lastEffectiveCursor.globalSequence,
        record.lastEffectiveCursor.pendingCommitSequence,
        record.lastCommitSequence,
        record.writtenAt,
      ]
    );
  }

  async remove(projectionId: ProjectionId, scopeKey: ScopeKey): Promise<void> {
    await this.db.execute(
      'DELETE FROM projection_cache WHERE projection_id = ? AND scope_key = ?',
      [projectionId, scopeKey]
    );
  }

  async removeAll(projectionId: ProjectionId): Promise<void> {
    await this.db.execute(
      'DELETE FROM projection_cache WHERE projection_id = ?',
      [projectionId]
    );
  }
}
