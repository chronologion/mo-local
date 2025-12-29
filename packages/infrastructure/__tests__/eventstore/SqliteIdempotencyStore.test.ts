import { describe, expect, it } from 'vitest';
import { SqliteIdempotencyStore } from '../../src/idempotency/SqliteIdempotencyStore';
import { TestSqliteDb } from './TestSqliteDb';

describe('SqliteIdempotencyStore', () => {
  it('records and reads idempotency keys', async () => {
    const db = new TestSqliteDb();
    const store = new SqliteIdempotencyStore(db);

    await store.record({
      key: 'idem-1',
      commandType: 'CreateGoal',
      aggregateId: 'goal-1',
      createdAt: 10,
    });

    const record = await store.get('idem-1');
    expect(record).not.toBeNull();
    expect(record?.commandType).toBe('CreateGoal');
  });

  it('throws when idempotency key reused with different metadata', async () => {
    const db = new TestSqliteDb();
    const store = new SqliteIdempotencyStore(db);

    await store.record({
      key: 'idem-2',
      commandType: 'CreateGoal',
      aggregateId: 'goal-1',
      createdAt: 10,
    });

    await expect(
      store.record({
        key: 'idem-2',
        commandType: 'CreateProject',
        aggregateId: 'project-1',
        createdAt: 12,
      })
    ).rejects.toThrow(/Idempotency key reuse detected/);
  });
});
