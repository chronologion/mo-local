import type { CryptoServicePort, EncryptedEvent } from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import type { PendingVersionRewriteRequest, PendingVersionRewriteResult } from '@mo/sync-engine';
import { buildEventAad } from '../eventing/aad';
import { KeyringManager } from '../crypto/KeyringManager';

type PendingEventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
}>;

export class PendingEventVersionRewriter {
  constructor(
    private readonly db: SqliteDbPort,
    private readonly crypto: CryptoServicePort,
    private readonly keyringManager: KeyringManager
  ) {}

  async rewritePendingVersions(params: PendingVersionRewriteRequest): Promise<PendingVersionRewriteResult> {
    // Rewrite must be atomic-ish: avoid leaving a partial shift applied.
    await this.db.execute('BEGIN');
    try {
      const pending = await this.db.query<PendingEventRow>(
        `
          SELECT
            e.id,
            e.aggregate_type,
            e.aggregate_id,
            e.event_type,
            e.payload_encrypted,
            e.version,
            e.occurred_at,
            e.actor_id,
            e.causation_id,
            e.correlation_id
          FROM events e
          LEFT JOIN sync_event_map m ON m.event_id = e.id
          WHERE e.aggregate_type = ?
            AND e.aggregate_id = ?
            AND e.version >= ?
            AND m.event_id IS NULL
          ORDER BY e.version DESC
        `,
        [params.aggregateType, params.aggregateId, params.fromVersionInclusive]
      );

      const oldMaxVersion = pending[0]?.version ?? null;
      const shiftedCount = pending.length;
      for (const row of pending) {
        const nextVersion = Number(row.version) + 1;
        const event: EncryptedEvent = {
          id: row.id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          payload: row.payload_encrypted,
          version: Number(row.version),
          occurredAt: Number(row.occurred_at),
          actorId: row.actor_id,
          causationId: row.causation_id,
          correlationId: row.correlation_id,
        };

        const key = await this.keyringManager.resolveKeyForEvent(event);
        const plaintext = await this.crypto.decrypt(
          row.payload_encrypted,
          key,
          buildEventAad(row.aggregate_type, row.aggregate_id, Number(row.version))
        );
        const rewritten = await this.crypto.encrypt(
          plaintext,
          key,
          buildEventAad(row.aggregate_type, row.aggregate_id, nextVersion)
        );

        await this.db.execute('UPDATE events SET version = ?, payload_encrypted = ? WHERE id = ?', [
          nextVersion,
          rewritten,
          row.id,
        ]);
      }

      // Domain snapshots are derived state; version shifts invalidate them.
      await this.db.execute('DELETE FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ?', [
        params.aggregateType,
        params.aggregateId,
      ]);

      await this.db.execute('COMMIT');
      return {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        fromVersionInclusive: params.fromVersionInclusive,
        shiftedCount,
        oldMaxVersion,
        newMaxVersion: oldMaxVersion === null ? null : oldMaxVersion + 1,
      };
    } catch (error) {
      try {
        await this.db.execute('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    }
  }
}
