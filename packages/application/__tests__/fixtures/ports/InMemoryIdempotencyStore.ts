import type { IdempotencyStorePort, IdempotencyRecord } from '../../../src/shared/ports';

export class InMemoryIdempotencyStore implements IdempotencyStorePort {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async record(record: IdempotencyRecord): Promise<void> {
    const existing = this.records.get(record.key);
    if (existing) {
      if (existing.commandType !== record.commandType || existing.aggregateId !== record.aggregateId) {
        throw new Error(
          `Idempotency key reuse detected for ${record.key} (existing ${existing.commandType}/${existing.aggregateId}, new ${record.commandType}/${record.aggregateId})`
        );
      }
      return;
    }
    this.records.set(record.key, record);
  }
}
