import type { IdempotencyRecord, IdempotencyStorePort } from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';

export class SqliteIdempotencyStore implements IdempotencyStorePort {
  constructor(private readonly db: SqliteDbPort) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const rows = await this.db.query<
      Readonly<{
        idempotency_key: string;
        command_type: string;
        aggregate_id: string;
        created_at: number;
      }>
    >(
      'SELECT idempotency_key, command_type, aggregate_id, created_at FROM idempotency_keys WHERE idempotency_key = ? LIMIT 1',
      [key]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      key: row.idempotency_key,
      commandType: row.command_type,
      aggregateId: row.aggregate_id,
      createdAt: row.created_at,
    };
  }

  async record(record: IdempotencyRecord): Promise<void> {
    const existing = await this.get(record.key);
    if (existing) {
      if (existing.commandType !== record.commandType || existing.aggregateId !== record.aggregateId) {
        throw new Error(
          `Idempotency key reuse detected for ${record.key} (existing ${existing.commandType}/${existing.aggregateId}, new ${record.commandType}/${record.aggregateId})`
        );
      }
      return;
    }

    await this.db.execute(
      'INSERT INTO idempotency_keys (idempotency_key, command_type, aggregate_id, created_at) VALUES (?, ?, ?, ?)',
      [record.key, record.commandType, record.aggregateId, record.createdAt]
    );
  }
}
