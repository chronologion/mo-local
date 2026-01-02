import { ConcurrencyError } from '@mo/application';
import type { SqliteDbPort, SqliteStatement } from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import type { AppendedEncryptedEvent, EncryptedEventToAppend, EventTableSpec, KnownVersion } from './types';

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
    const expectedStartVersion = await this.readExpectedStartVersion(db, spec, known);

    if (sorted[0]?.version !== expectedStartVersion) {
      throw new ConcurrencyError(`Version conflict for ${known.aggregateId}: expected ${expectedStartVersion}`);
    }

    for (let idx = 1; idx < sorted.length; idx += 1) {
      const expected = expectedStartVersion + idx;
      if (sorted[idx]?.version !== expected) {
        throw new ConcurrencyError(`Non-monotonic versions for ${known.aggregateId}: expected ${expected}`);
      }
    }

    const statements: SqliteStatement[] = sorted.map((event) => ({
      kind: SqliteStatementKinds.query,
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
        RETURNING
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

    const rowsFromReturning = await this.tryInsertWithReturning(
      db,
      statements,
      sorted.map((event) => event.eventId),
      spec.table
    );

    return rowsFromReturning.map((row) => ({
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

  private async readExpectedStartVersion(db: SqliteDbPort, spec: EventTableSpec, known: KnownVersion): Promise<number> {
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
      return String((error as { message?: unknown }).message).includes('CONSTRAINT');
    }
    return false;
  }

  private isReturningUnsupported(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if ('message' in error) {
      const message = String((error as { message?: unknown }).message);
      return message.includes('RETURNING') && (message.includes('syntax') || message.includes('near'));
    }
    return false;
  }

  private async tryInsertWithReturning(
    db: SqliteDbPort,
    statements: ReadonlyArray<SqliteStatement>,
    eventIds: ReadonlyArray<string>,
    table: string
  ): Promise<
    ReadonlyArray<{
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
  > {
    try {
      const results = await db.batch(statements);
      const rows = results.flatMap((result) => (result.kind === SqliteStatementKinds.query ? result.rows : []));
      if (rows.length === eventIds.length) {
        return rows.map((row) => this.toReturningRow(row));
      }
      throw new Error('RETURNING did not return all rows');
    } catch (error) {
      if (this.isConstraintError(error)) {
        throw new ConcurrencyError('Version conflict for aggregate: concurrent write detected');
      }
      if (!this.isReturningUnsupported(error)) {
        throw error;
      }
    }

    const fallbackStatements: SqliteStatement[] = statements.map((statement) => ({
      kind: SqliteStatementKinds.execute,
      sql: statement.sql.replace(/\s+RETURNING[\s\S]*$/i, ''),
      params: statement.params,
    }));

    await db.batch(fallbackStatements);

    return db.query<
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
        FROM ${table}
        WHERE id IN (${eventIds.map(() => '?').join(', ')})
        ORDER BY commit_sequence ASC
      `,
      eventIds
    );
  }

  private toReturningRow(row: Readonly<Record<string, unknown>>): {
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
  } {
    const commitSequence = this.readNumber(row, 'commit_sequence');
    const version = this.readNumber(row, 'version');
    const occurredAt = this.readNumber(row, 'occurred_at');
    const epoch = this.readNullableNumber(row, 'epoch');

    const id = this.readString(row, 'id');
    const aggregateId = this.readString(row, 'aggregate_id');
    const eventType = this.readString(row, 'event_type');

    const payload = row.payload_encrypted;
    if (!(payload instanceof Uint8Array)) {
      throw new Error('RETURNING row missing payload_encrypted');
    }

    const keyringUpdateValue = row.keyring_update;
    const keyringUpdate = keyringUpdateValue instanceof Uint8Array ? keyringUpdateValue : null;

    return {
      commit_sequence: commitSequence,
      id,
      aggregate_id: aggregateId,
      event_type: eventType,
      payload_encrypted: payload,
      keyring_update: keyringUpdate,
      version,
      occurred_at: occurredAt,
      actor_id: this.readNullableString(row, 'actor_id'),
      causation_id: this.readNullableString(row, 'causation_id'),
      correlation_id: this.readNullableString(row, 'correlation_id'),
      epoch,
    };
  }

  private readString(row: Readonly<Record<string, unknown>>, key: string): string {
    const value = row[key];
    if (typeof value !== 'string') {
      throw new Error(`RETURNING row missing ${key}`);
    }
    return value;
  }

  private readNullableString(row: Readonly<Record<string, unknown>>, key: string): string | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
      throw new Error(`RETURNING row ${key} is not string`);
    }
    return value;
  }

  private readNumber(row: Readonly<Record<string, unknown>>, key: string): number {
    const value = row[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (!Number.isSafeInteger(asNumber)) {
        throw new Error(`RETURNING row ${key} exceeds safe integer`);
      }
      return asNumber;
    }
    throw new Error(`RETURNING row ${key} is not numeric`);
  }

  private readNullableNumber(row: Readonly<Record<string, unknown>>, key: string): number | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    return this.readNumber(row, key);
  }
}
