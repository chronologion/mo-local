import type { SqliteDbPort } from '@mo/eventstore-web';
import type { EffectiveCursor } from '@mo/eventstore-core';
import type { EventTableSpec, SnapshotRecord } from './types';

export interface SnapshotStore {
  get(db: SqliteDbPort, spec: EventTableSpec, aggregateId: string): Promise<SnapshotRecord | null>;
  put(db: SqliteDbPort, spec: EventTableSpec, record: SnapshotRecord): Promise<void>;
}

export class SqliteSnapshotStore implements SnapshotStore {
  async get(db: SqliteDbPort, spec: EventTableSpec, aggregateId: string): Promise<SnapshotRecord | null> {
    const rows = await db.query<
      Readonly<{
        aggregate_id: string;
        snapshot_version: number;
        snapshot_encrypted: Uint8Array;
        last_global_seq: number;
        last_pending_commit_seq: number;
        written_at: number;
      }>
    >(
      `
        SELECT
          aggregate_id,
          snapshot_version,
          snapshot_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          written_at
        FROM snapshots
        WHERE aggregate_type = ? AND aggregate_id = ?
        LIMIT 1
      `,
      [spec.aggregateType, aggregateId]
    );

    const row = rows[0];
    if (!row) return null;

    const cursor: EffectiveCursor = {
      globalSequence: row.last_global_seq,
      pendingCommitSequence: row.last_pending_commit_seq,
    };

    return {
      aggregateId: row.aggregate_id,
      snapshotVersion: row.snapshot_version,
      snapshotEncrypted: row.snapshot_encrypted,
      lastEffectiveCursor: cursor,
      writtenAt: row.written_at,
    };
  }

  async put(db: SqliteDbPort, spec: EventTableSpec, record: SnapshotRecord): Promise<void> {
    await db.execute(
      `
        INSERT INTO snapshots (
          aggregate_type,
          aggregate_id,
          snapshot_version,
          snapshot_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          written_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(aggregate_type, aggregate_id) DO UPDATE SET
          snapshot_version = excluded.snapshot_version,
          snapshot_encrypted = excluded.snapshot_encrypted,
          last_global_seq = excluded.last_global_seq,
          last_pending_commit_seq = excluded.last_pending_commit_seq,
          written_at = excluded.written_at
      `,
      [
        spec.aggregateType,
        record.aggregateId,
        record.snapshotVersion,
        record.snapshotEncrypted,
        record.lastEffectiveCursor.globalSequence,
        record.lastEffectiveCursor.pendingCommitSequence,
        record.writtenAt,
      ]
    );
  }
}
