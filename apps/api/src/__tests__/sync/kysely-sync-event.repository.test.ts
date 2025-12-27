import { describe, expect, it } from 'vitest';
import { KyselySyncEventRepository } from '../../sync/infrastructure/kysely-sync-event.repository';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import type { SyncDatabaseService } from '../../sync/infrastructure/database.service';
import type { SyncEvent } from '../../sync/domain/SyncEvent';

type EventRow = {
  owner_identity_id: string;
  store_id: string;
  seq_num: number;
  parent_seq_num: number;
  name: string;
  args: string;
  client_id: string;
  session_id: string;
  created_at: Date;
};

type StoreRow = { store_id: string };

type WhereClause = {
  column: string;
  op: '=' | '>';
  value: string | number;
};

class FakeDb {
  events: EventRow[] = [];
  stores: StoreRow[] = [];
}

type FakeTrx = {
  selectFrom: (
    table: 'sync.stores' | 'sync.events'
  ) => FakeSelectBuilder<StoreRow | EventRow>;
  insertInto: (table: 'sync.events') => {
    values: (rows: EventRow[]) => { execute: () => Promise<void> };
  };
};

class FakeSelectBuilder<T extends { [key: string]: unknown }> {
  constructor(
    private readonly rows: T[],
    private readonly clauses: WhereClause[] = [],
    private readonly mode: 'rows' | 'head' = 'rows',
    private readonly limitValue?: number,
    private readonly orderByClause?: {
      column: string;
      direction: 'asc' | 'desc';
    }
  ) {}

  select(arg: unknown): FakeSelectBuilder<T> {
    const nextMode = typeof arg === 'function' ? 'head' : 'rows';
    return new FakeSelectBuilder(
      this.rows,
      this.clauses,
      nextMode,
      this.limitValue,
      this.orderByClause
    );
  }

  where(column: string, op: '=' | '>', value: string | number): this {
    return new FakeSelectBuilder(
      this.rows,
      [...this.clauses, { column, op, value }],
      this.mode,
      this.limitValue,
      this.orderByClause
    ) as this;
  }

  orderBy(column: string, direction: 'asc' | 'desc'): this {
    return new FakeSelectBuilder(
      this.rows,
      this.clauses,
      this.mode,
      this.limitValue,
      { column, direction }
    ) as this;
  }

  limit(value: number): this {
    return new FakeSelectBuilder(
      this.rows,
      this.clauses,
      this.mode,
      value,
      this.orderByClause
    ) as this;
  }

  forUpdate(): this {
    return this;
  }

  executeTakeFirst(): T | { head: number } | undefined {
    const filtered = this.applyClauses();
    if (this.mode === 'head') {
      const max = filtered.reduce((acc, row) => {
        const seq = Number(row['seq_num']);
        return Number.isNaN(seq) ? acc : Math.max(acc, seq);
      }, 0);
      return { head: max };
    }
    return filtered[0];
  }

  execute(): T[] | { head: number }[] {
    const filtered = this.applyClauses();
    if (this.mode === 'head') {
      const max = filtered.reduce((acc, row) => {
        const seq = Number(row['seq_num']);
        return Number.isNaN(seq) ? acc : Math.max(acc, seq);
      }, 0);
      return [{ head: max }];
    }
    return filtered;
  }

  private applyClauses(): T[] {
    let result = this.rows.filter((row) =>
      this.clauses.every((clause) => {
        const value = row[clause.column];
        if (clause.op === '=') {
          return value === clause.value;
        }
        if (typeof value === 'number' && typeof clause.value === 'number') {
          return value > clause.value;
        }
        return false;
      })
    );
    if (this.orderByClause) {
      const { column, direction } = this.orderByClause;
      result = [...result].sort((a, b) => {
        const left = Number(a[column]);
        const right = Number(b[column]);
        return direction === 'asc' ? left - right : right - left;
      });
    }
    if (this.limitValue !== undefined) {
      return result.slice(0, this.limitValue);
    }
    return result;
  }
}

// SyncDatabaseService is a concrete class; use a minimal test double via cast.
const makeDbService = (db: FakeDb): SyncDatabaseService =>
  ({
    getDb: () => ({
      transaction: () => ({
        execute: async (fn: (trx: FakeTrx) => Promise<unknown>) => {
          return fn({
            selectFrom: (table: 'sync.stores' | 'sync.events') => {
              if (table === 'sync.stores') {
                return new FakeSelectBuilder(db.stores);
              }
              return new FakeSelectBuilder(db.events);
            },
            insertInto: (_table: 'sync.events') => ({
              values: (rows: EventRow[]) => ({
                execute: async () => {
                  db.events.push(...rows.map((row) => ({ ...row })));
                },
              }),
            }),
          });
        },
      }),
      selectFrom: (table: 'sync.stores' | 'sync.events') => {
        if (table === 'sync.stores') {
          return new FakeSelectBuilder(db.stores);
        }
        return new FakeSelectBuilder(db.events);
      },
    }),
  }) as unknown as SyncDatabaseService;

describe('KyselySyncEventRepository', () => {
  it('preserves event args bytes through append and load', async () => {
    const db = new FakeDb();
    db.stores.push({ store_id: 'store-1' });
    const repo = new KyselySyncEventRepository(makeDbService(db));
    const ownerId = SyncOwnerId.from('owner-1');
    const storeId = SyncStoreId.from('store-1');

    const args = { z: 1, a: { b: 2, c: 3 } };
    const event: SyncEvent = {
      ownerId,
      storeId,
      seqNum: GlobalSequenceNumber.from(1),
      parentSeqNum: GlobalSequenceNumber.from(0),
      name: 'event.one',
      args,
      clientId: 'client-1',
      sessionId: 'session-1',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };

    await repo.appendBatch([event], GlobalSequenceNumber.from(0));

    const stored = db.events[0];
    expect(stored).toBeDefined();
    const storedArgs = stored?.args ?? '';
    expect(storedArgs).toBe(JSON.stringify(args));

    const loaded = await repo.loadSince(
      ownerId,
      storeId,
      GlobalSequenceNumber.from(0),
      10
    );

    expect(loaded).toHaveLength(1);
    const loadedArgs = loaded[0]?.args ?? null;
    expect(JSON.stringify(loadedArgs)).toBe(storedArgs);
  });
});
