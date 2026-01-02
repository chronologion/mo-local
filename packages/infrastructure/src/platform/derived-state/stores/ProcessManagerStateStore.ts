import type { EffectiveCursor } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import type { ScopeKey } from '../types';

export type ProcessManagerStateRecord = Readonly<{
  processManagerId: string;
  scopeKey: ScopeKey;
  stateVersion: number;
  stateEncrypted: Uint8Array;
  lastEffectiveCursor: EffectiveCursor;
  updatedAt: number;
}>;

export class ProcessManagerStateStore {
  constructor(private readonly db: SqliteDbPort) {}

  async get(processManagerId: string, scopeKey: ScopeKey): Promise<ProcessManagerStateRecord | null> {
    const rows = await this.db.query<
      Readonly<{
        process_manager_id: string;
        scope_key: string;
        state_version: number;
        state_encrypted: Uint8Array;
        last_global_seq: number;
        last_pending_commit_seq: number;
        updated_at: number;
      }>
    >(
      `
        SELECT
          process_manager_id,
          scope_key,
          state_version,
          state_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          updated_at
        FROM process_manager_state
        WHERE process_manager_id = ? AND scope_key = ?
        LIMIT 1
      `,
      [processManagerId, scopeKey]
    );

    const row = rows[0];
    if (!row) return null;
    return {
      processManagerId: row.process_manager_id,
      scopeKey: row.scope_key,
      stateVersion: Number(row.state_version),
      stateEncrypted: row.state_encrypted,
      lastEffectiveCursor: {
        globalSequence: Number(row.last_global_seq),
        pendingCommitSequence: Number(row.last_pending_commit_seq),
      },
      updatedAt: Number(row.updated_at),
    };
  }

  async put(record: ProcessManagerStateRecord): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO process_manager_state (
          process_manager_id,
          scope_key,
          state_version,
          state_encrypted,
          last_global_seq,
          last_pending_commit_seq,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(process_manager_id, scope_key) DO UPDATE SET
          state_version = excluded.state_version,
          state_encrypted = excluded.state_encrypted,
          last_global_seq = excluded.last_global_seq,
          last_pending_commit_seq = excluded.last_pending_commit_seq,
          updated_at = excluded.updated_at
      `,
      [
        record.processManagerId,
        record.scopeKey,
        record.stateVersion,
        record.stateEncrypted,
        record.lastEffectiveCursor.globalSequence,
        record.lastEffectiveCursor.pendingCommitSequence,
        record.updatedAt,
      ]
    );
  }

  async remove(processManagerId: string, scopeKey: ScopeKey): Promise<void> {
    await this.db.execute('DELETE FROM process_manager_state WHERE process_manager_id = ? AND scope_key = ?', [
      processManagerId,
      scopeKey,
    ]);
  }

  async removeAll(processManagerId: string): Promise<void> {
    await this.db.execute('DELETE FROM process_manager_state WHERE process_manager_id = ?', [processManagerId]);
  }
}
