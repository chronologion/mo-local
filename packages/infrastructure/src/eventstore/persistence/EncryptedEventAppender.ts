import { ConcurrencyError } from '@mo/application';
import type { SqliteDbPort, SqliteStatement } from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import type {
  AppendedEncryptedEvent,
  EncryptedEventToAppend,
  EventTableSpec,
  KnownVersion,
} from './types';

export interface EncryptedEventAppender {
  appendForAggregate(
    db: SqliteDbPort,
    spec: EventTableSpec,
    known: KnownVersion,
    events: ReadonlyArray<EncryptedEventToAppend>
  ): Promise<ReadonlyArray<AppendedEncryptedEvent>>;
}

export class SqliteEncryptedEventAppender implements EncryptedEventAppender {
  async appendForAggregate(
    db: SqliteDbPort,
    spec: EventTableSpec,
    known: KnownVersion,
    events: ReadonlyArray<EncryptedEventToAppend>
  ): Promise<ReadonlyArray<AppendedEncryptedEvent>> {
    if (events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.version - b.version);
    const expectedStartVersion = await this.readExpectedStartVersion(
      db,
      spec,
      known
    );

    if (sorted[0]?.version !== expectedStartVersion) {
      throw new ConcurrencyError(
        `Version conflict for ${known.aggregateId}: expected ${expectedStartVersion}`
      );
    }

    for (let idx = 1; idx < sorted.length; idx += 1) {
      const expected = expectedStartVersion + idx;
      if (sorted[idx]?.version !== expected) {
        throw new ConcurrencyError(
          `Non-monotonic versions for ${known.aggregateId}: expected ${expected}`
        );
      }
    }

    const statements: SqliteStatement[] = sorted.map((event) => ({
      kind: SqliteStatementKinds.execute,
      sql: `
        INSERT INTO ${spec.table} (
          id,
          aggregate_type,
          aggregate_id,
          event_type,
          payload_encrypted,
          keyring_update,
          version,
          occurred_at,
          actor_id,
          causation_id,
          correlation_id,
          epoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        event.eventId,
        spec.aggregateType,
        event.aggregateId,
        event.eventType,
        event.payload,
        event.keyringUpdate,
        event.version,
        event.occurredAt,
        event.actorId,
        event.causationId,
        event.correlationId,
        event.epoch,
      ],
    }));

    try {
      await db.batch(statements);
    } catch (error) {
      if (this.isConstraintError(error)) {
        throw new ConcurrencyError(
          `Version conflict for ${known.aggregateId}: concurrent write detected`
        );
      }
      throw error;
    }

    const appendedRows = await db.query<
      Readonly<{
        commit_sequence: number;
        id: string;
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
      }>
    >(
      `
        SELECT
          commit_sequence,
          id,
          aggregate_id,
          event_type,
          payload_encrypted,
          keyring_update,
          version,
          occurred_at,
          actor_id,
          causation_id,
          correlation_id,
          epoch
        FROM ${spec.table}
        WHERE id IN (${sorted.map(() => '?').join(', ')})
        ORDER BY commit_sequence ASC
      `,
      sorted.map((event) => event.eventId)
    );

    return appendedRows.map((row) => ({
      eventId: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: row.version,
      occurredAt: row.occurred_at,
      actorId: row.actor_id,
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      epoch: row.epoch,
      keyringUpdate: row.keyring_update,
      commitSequence: row.commit_sequence,
    }));
  }

  private async readExpectedStartVersion(
    db: SqliteDbPort,
    spec: EventTableSpec,
    known: KnownVersion
  ): Promise<number> {
    const rows = await db.query<Readonly<{ version: number | null }>>(
      `SELECT MAX(version) as version FROM ${spec.table} WHERE aggregate_type = ? AND aggregate_id = ?`,
      [spec.aggregateType, known.aggregateId]
    );
    const maxVersion = Number(rows[0]?.version ?? 0);
    if (known.version !== null && maxVersion !== known.version) {
      throw new ConcurrencyError(
        `Version mismatch for ${known.aggregateId}: expected ${known.version}, got ${maxVersion}`
      );
    }
    return maxVersion + 1;
  }

  private isConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if ('code' in error) {
      return String((error as { code?: unknown }).code).includes('CONSTRAINT');
    }
    if ('message' in error) {
      return String((error as { message?: unknown }).message).includes(
        'CONSTRAINT'
      );
    }
    return false;
  }
}
