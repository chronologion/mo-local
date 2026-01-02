import type { EffectiveCursor, ProjectionOrdering } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import type { ProjectionPhase, ProjectionId } from '../types';

export type ProjectionMetaRecord = Readonly<{
  projectionId: ProjectionId;
  ordering: ProjectionOrdering;
  lastEffectiveCursor: EffectiveCursor;
  lastCommitSequence: number;
  phase: ProjectionPhase;
  updatedAt: number;
}>;

export class ProjectionMetaStore {
  constructor(private readonly db: SqliteDbPort) {}

  async get(projectionId: ProjectionId): Promise<ProjectionMetaRecord | null> {
    const rows = await this.db.query<
      Readonly<{
        projection_id: string;
        ordering: string;
        last_global_seq: number;
        last_pending_commit_seq: number;
        last_commit_sequence: number;
        phase: string;
        updated_at: number;
      }>
    >(
      `
        SELECT
          projection_id,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          phase,
          updated_at
        FROM projection_meta
        WHERE projection_id = ?
        LIMIT 1
      `,
      [projectionId]
    );

    const row = rows[0];
    if (!row) return null;
    return {
      projectionId: row.projection_id,
      ordering: row.ordering as ProjectionOrdering,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      lastCommitSequence: Number(row.last_commit_sequence),
      phase: row.phase as ProjectionPhase,
      updatedAt: Number(row.updated_at),
    };
  }

  async list(): Promise<ReadonlyArray<ProjectionMetaRecord>> {
    const rows = await this.db.query<
      Readonly<{
        projection_id: string;
        ordering: string;
        last_global_seq: number;
        last_pending_commit_seq: number;
        last_commit_sequence: number;
        phase: string;
        updated_at: number;
      }>
    >(
      `
        SELECT
          projection_id,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          phase,
          updated_at
        FROM projection_meta
      `
    );

    return rows.map((row) => ({
      projectionId: row.projection_id,
      ordering: row.ordering as ProjectionOrdering,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      lastCommitSequence: Number(row.last_commit_sequence),
      phase: row.phase as ProjectionPhase,
      updatedAt: Number(row.updated_at),
    }));
  }

  async upsert(record: ProjectionMetaRecord): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO projection_meta (
          projection_id,
          ordering,
          last_global_seq,
          last_pending_commit_seq,
          last_commit_sequence,
          phase,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(projection_id) DO UPDATE SET
          ordering = excluded.ordering,
          last_global_seq = excluded.last_global_seq,
          last_pending_commit_seq = excluded.last_pending_commit_seq,
          last_commit_sequence = excluded.last_commit_sequence,
          phase = excluded.phase,
          updated_at = excluded.updated_at
      `,
      [
        record.projectionId,
        record.ordering,
        record.lastEffectiveCursor.globalSequence,
        record.lastEffectiveCursor.pendingCommitSequence,
        record.lastCommitSequence,
        record.phase,
        record.updatedAt,
      ]
    );
  }

  async remove(projectionId: ProjectionId): Promise<void> {
    await this.db.execute('DELETE FROM projection_meta WHERE projection_id = ?', [projectionId]);
  }
}
