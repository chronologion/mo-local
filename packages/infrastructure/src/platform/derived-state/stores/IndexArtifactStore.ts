import type { EffectiveCursor } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import type { ScopeKey } from '../types';

export type IndexArtifactRecord = Readonly<{
  indexId: string;
  scopeKey: ScopeKey;
  artifactVersion: number;
  artifactEncrypted: Uint8Array;
  lastEffectiveCursor: EffectiveCursor;
  writtenAt: number;
}>;

export class IndexArtifactStore {
  constructor(private readonly db: SqliteDbPort) {}

  async get(indexId: string, scopeKey: ScopeKey): Promise<IndexArtifactRecord | null> {
    const rows = await this.db.query<
      Readonly<{
        index_id: string;
        scope_key: string;
        artifact_version: number;
        artifact_encrypted: Uint8Array;
        last_global_seq: number;
        last_pending_commit_seq: number;
        written_at: number;
      }>
    >(
      `
        SELECT
          index_id,
          scope_key,
          artifact_version,
          artifact_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          written_at
        FROM index_artifacts
        WHERE index_id = ? AND scope_key = ?
        LIMIT 1
      `,
      [indexId, scopeKey]
    );

    const row = rows[0];
    if (!row) return null;
    return {
      indexId: row.index_id,
      scopeKey: row.scope_key,
      artifactVersion: Number(row.artifact_version),
      artifactEncrypted: row.artifact_encrypted,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      writtenAt: Number(row.written_at),
    };
  }

  async put(record: IndexArtifactRecord): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO index_artifacts (
          index_id,
          scope_key,
          artifact_version,
          artifact_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          written_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(index_id, scope_key) DO UPDATE SET
          artifact_version = excluded.artifact_version,
          artifact_encrypted = excluded.artifact_encrypted,
          last_global_seq = excluded.last_global_seq,
          last_pending_commit_seq = excluded.last_pending_commit_seq,
          written_at = excluded.written_at
      `,
      [
        record.indexId,
        record.scopeKey,
        record.artifactVersion,
        record.artifactEncrypted,
        record.lastEffectiveCursor.globalSequence,
        record.lastEffectiveCursor.pendingCommitSequence,
        record.writtenAt,
      ]
    );
  }

  async remove(indexId: string, scopeKey: ScopeKey): Promise<void> {
    await this.db.execute('DELETE FROM index_artifacts WHERE index_id = ? AND scope_key = ?', [indexId, scopeKey]);
  }

  async removeAll(indexId: string): Promise<void> {
    await this.db.execute('DELETE FROM index_artifacts WHERE index_id = ?', [indexId]);
  }
}
