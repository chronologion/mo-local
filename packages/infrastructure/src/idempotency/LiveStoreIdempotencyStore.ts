import type { Store } from '@livestore/livestore';
import type { IIdempotencyStore, IdempotencyRecord } from '@mo/application';

type Row = {
  idempotency_key: string;
  command_type: string;
  aggregate_id: string;
  created_at: number;
};

export class LiveStoreIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly store: Store) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const rows = this.store.query<Row[]>({
      query:
        'SELECT idempotency_key, command_type, aggregate_id, created_at FROM idempotency_keys WHERE idempotency_key = ? LIMIT 1',
      bindValues: [key],
    });
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
      if (
        existing.commandType !== record.commandType ||
        existing.aggregateId !== record.aggregateId
      ) {
        throw new Error(
          `Idempotency key reuse detected for ${record.key} (existing ${existing.commandType}/${existing.aggregateId}, new ${record.commandType}/${record.aggregateId})`
        );
      }
      return;
    }

    this.store.query({
      query:
        'INSERT INTO idempotency_keys (idempotency_key, command_type, aggregate_id, created_at) VALUES (?, ?, ?, ?)',
      bindValues: [
        record.key,
        record.commandType,
        record.aggregateId,
        record.createdAt,
      ],
    });
  }
}
