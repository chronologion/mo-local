import type {
  ChangeHint,
  SqliteBatchResult,
  SqliteDbPort,
  SqliteStatement,
  SqliteValue,
} from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';

export type TestEventRow = {
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
};

type IdempotencyRow = {
  idempotency_key: string;
  command_type: string;
  aggregate_id: string;
  created_at: number;
};

export class TestSqliteDb implements SqliteDbPort {
  private readonly events: TestEventRow[] = [];
  private readonly idempotency = new Map<string, IdempotencyRow>();
  private nextCommitSequence = 1;

  constructor(seed?: { events?: ReadonlyArray<TestEventRow> }) {
    if (seed?.events) {
      this.events.push(...seed.events);
      const maxSeq = seed.events.reduce(
        (max, row) => Math.max(max, row.commit_sequence),
        0
      );
      this.nextCommitSequence = maxSeq + 1;
    }
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = sql.trim().toUpperCase();
    if (this.isSelectMaxVersion(normalized)) {
      const [aggregateType, aggregateId] = params as [string, string];
      const maxVersion = this.events
        .filter(
          (row) =>
            row.aggregate_type === aggregateType &&
            row.aggregate_id === aggregateId
        )
        .reduce((max, row) => Math.max(max, row.version), 0);
      return [{ version: maxVersion || null } as T];
    }

    if (this.isSelectEventsByIds(normalized)) {
      const ids = params as ReadonlyArray<string>;
      const rows = this.events
        .filter((row) => ids.includes(row.id))
        .sort((a, b) => a.commit_sequence - b.commit_sequence);
      return rows as T[];
    }

    if (this.isSelectEventsForAggregate(normalized)) {
      const [aggregateType, aggregateId, fromVersion] = params as [
        string,
        string,
        number,
      ];
      const rows = this.events
        .filter(
          (row) =>
            row.aggregate_type === aggregateType &&
            row.aggregate_id === aggregateId &&
            row.version >= Number(fromVersion)
        )
        .sort((a, b) => a.version - b.version);
      return rows as T[];
    }

    if (this.isSelectIdempotency(normalized)) {
      const key = params[0] as string;
      const row = this.idempotency.get(key);
      return row ? ([row] as T[]) : [];
    }

    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<void> {
    const normalized = sql.trim().toUpperCase();
    if (this.isInsertIdempotency(normalized)) {
      const [key, commandType, aggregateId, createdAt] = params as [
        string,
        string,
        string,
        number,
      ];
      this.idempotency.set(key, {
        idempotency_key: key,
        command_type: commandType,
        aggregate_id: aggregateId,
        created_at: Number(createdAt),
      });
      return;
    }
    throw new Error(`Unhandled execute: ${sql}`);
  }

  async batch(
    statements: ReadonlyArray<SqliteStatement>
  ): Promise<ReadonlyArray<SqliteBatchResult>> {
    const results: SqliteBatchResult[] = [];
    for (const statement of statements) {
      if (statement.kind === SqliteStatementKinds.execute) {
        this.applyExecute(statement.sql, statement.params ?? []);
        results.push({ kind: SqliteStatementKinds.execute });
        continue;
      }
      if (this.isInsertEventsReturning(statement.sql)) {
        const row = this.applyInsertReturning(
          statement.sql,
          statement.params ?? []
        );
        results.push({ kind: SqliteStatementKinds.query, rows: [row] });
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

  private applyExecute(sql: string, params: ReadonlyArray<SqliteValue>): void {
    const normalized = sql.trim().toUpperCase();
    if (this.isInsertEvents(normalized)) {
      const [
        id,
        aggregateType,
        aggregateId,
        eventType,
        payload,
        keyringUpdate,
        version,
        occurredAt,
        actorId,
        causationId,
        correlationId,
        epoch,
      ] = params as [
        string,
        string,
        string,
        string,
        Uint8Array,
        Uint8Array | null,
        number,
        number,
        string | null,
        string | null,
        string | null,
        number | null,
      ];
      const hasDuplicate = this.events.some(
        (row) =>
          row.aggregate_type === aggregateType &&
          row.aggregate_id === aggregateId &&
          row.version === Number(version)
      );
      if (hasDuplicate) {
        const error = new Error('UNIQUE constraint failed');
        (error as Error & { code?: string }).code = 'SQLITE_CONSTRAINT';
        throw error;
      }

      this.events.push({
        commit_sequence: this.nextCommitSequence,
        id,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        payload_encrypted: payload,
        keyring_update: keyringUpdate,
        version: Number(version),
        occurred_at: Number(occurredAt),
        actor_id: actorId ?? null,
        causation_id: causationId ?? null,
        correlation_id: correlationId ?? null,
        epoch: epoch ?? null,
      });
      this.nextCommitSequence += 1;
      return;
    }
    throw new Error(`Unhandled batch execute: ${sql}`);
  }

  getEvents(): ReadonlyArray<TestEventRow> {
    return [...this.events];
  }

  private isSelectMaxVersion(sql: string): boolean {
    return sql.includes('SELECT MAX(VERSION)');
  }

  private isSelectEventsByIds(sql: string): boolean {
    return sql.includes('FROM EVENTS') && sql.includes('WHERE ID IN');
  }

  private isSelectEventsForAggregate(sql: string): boolean {
    return (
      sql.includes('FROM EVENTS') &&
      sql.includes('AGGREGATE_TYPE = ?') &&
      sql.includes('AGGREGATE_ID = ?') &&
      sql.includes('VERSION >= ?')
    );
  }

  private isSelectIdempotency(sql: string): boolean {
    return sql.includes('FROM IDEMPOTENCY_KEYS');
  }

  private isInsertIdempotency(sql: string): boolean {
    return sql.startsWith('INSERT INTO IDEMPOTENCY_KEYS');
  }

  private isInsertEvents(sql: string): boolean {
    return sql.startsWith('INSERT INTO EVENTS');
  }

  private isInsertEventsReturning(sql: string): boolean {
    const normalized = sql.trim().toUpperCase();
    return this.isInsertEvents(normalized) && normalized.includes('RETURNING');
  }

  private applyInsertReturning(
    sql: string,
    params: ReadonlyArray<SqliteValue>
  ): TestEventRow {
    this.applyExecute(sql, params);
    const last = this.events[this.events.length - 1];
    if (!last) {
      throw new Error('INSERT RETURNING produced no row');
    }
    return last;
  }
}
