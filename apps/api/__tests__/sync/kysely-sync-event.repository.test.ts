import { describe, expect, it } from 'vitest';
import { KyselySyncEventRepository } from '../../src/sync/infrastructure/kysely-sync-event.repository';
import { SyncRepositoryHeadMismatchError } from '../../src/sync/application/ports/sync-event-repository';
import { GlobalSequenceNumber } from '../../src/sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../src/sync/domain/value-objects/SyncStoreId';
import type { SyncDatabaseService } from '../../src/sync/infrastructure/database.service';

type EventRow = {
  owner_identity_id: string;
  store_id: string;
  global_seq: number;
  event_id: string;
  record_json: string;
  created_at: Date;
};

type StoreRow = {
  store_id: string;
  owner_identity_id: string;
  head: number;
};

type WhereClause = {
  column: string;
  op: '=' | '>' | 'in';
  value: string | number | ReadonlyArray<string>;
};

class FakeDb {
  events: EventRow[] = [];
  stores: StoreRow[] = [];
}

class FakeSelectBuilder<T extends { [key: string]: unknown }> {
  constructor(
    private readonly rows: T[],
    private readonly clauses: WhereClause[] = [],
    private readonly limitValue?: number,
    private readonly orderByClause?: {
      column: string;
      direction: 'asc' | 'desc';
    }
  ) {}

  select(): FakeSelectBuilder<T> {
    return new FakeSelectBuilder(
      this.rows,
      this.clauses,
      this.limitValue,
      this.orderByClause
    );
  }

  where(
    column: string,
    op: '=' | '>' | 'in',
    value: WhereClause['value']
  ): this {
    return new FakeSelectBuilder(
      this.rows,
      [...this.clauses, { column, op, value }],
      this.limitValue,
      this.orderByClause
    ) as this;
  }

  orderBy(column: string, direction: 'asc' | 'desc'): this {
    return new FakeSelectBuilder(this.rows, this.clauses, this.limitValue, {
      column,
      direction,
    }) as this;
  }

  limit(value: number): this {
    return new FakeSelectBuilder(
      this.rows,
      this.clauses,
      value,
      this.orderByClause
    ) as this;
  }

  forUpdate(): this {
    return this;
  }

  executeTakeFirst(): T | undefined {
    return this.applyClauses()[0];
  }

  execute(): T[] {
    return this.applyClauses();
  }

  private applyClauses(): T[] {
    let result = this.rows.filter((row) =>
      this.clauses.every((clause) => {
        const value = row[clause.column];
        if (clause.op === '=') {
          return value === clause.value;
        }
        if (clause.op === 'in' && Array.isArray(clause.value)) {
          return clause.value.includes(String(value));
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

type FakeTrx = {
  selectFrom: (
    table: 'sync.stores' | 'sync.events'
  ) => FakeSelectBuilder<StoreRow | EventRow>;
  insertInto: (table: 'sync.events') => {
    values: (row: EventRow) => {
      onConflict: () => {
        returning: () => {
          executeTakeFirst: () => Promise<EventRow | undefined>;
        };
      };
    };
  };
  updateTable: (table: 'sync.stores') => {
    set: (values: Partial<StoreRow>) => {
      where: (
        column: string,
        _op: '=',
        value: string
      ) => { execute: () => Promise<void> };
    };
  };
};

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
            insertInto: () => ({
              values: (row: EventRow) => ({
                onConflict: () => ({
                  returning: () => ({
                    executeTakeFirst: async () => {
                      const exists = db.events.some(
                        (event) =>
                          event.owner_identity_id === row.owner_identity_id &&
                          event.store_id === row.store_id &&
                          event.event_id === row.event_id
                      );
                      if (exists) return undefined;
                      db.events.push({ ...row });
                      return row;
                    },
                  }),
                }),
              }),
            }),
            updateTable: () => ({
              set: (values: Partial<StoreRow>) => ({
                where: (_column: string, _op: '=', value: string) => ({
                  execute: async () => {
                    db.stores.forEach((store) => {
                      if (store.store_id === value) {
                        Object.assign(store, values);
                      }
                    });
                  },
                }),
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
  it('assigns global sequences and updates head', async () => {
    const db = new FakeDb();
    db.stores.push({
      store_id: 'store-1',
      owner_identity_id: 'owner-1',
      head: 0,
    });
    const repo = new KyselySyncEventRepository(makeDbService(db));
    const ownerId = SyncOwnerId.from('owner-1');
    const storeId = SyncStoreId.from('store-1');

    const result = await repo.appendBatch({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [
        { eventId: 'e1', recordJson: '{"a":1}' },
        { eventId: 'e2', recordJson: '{"b":2}' },
      ],
    });

    expect(result.head.unwrap()).toBe(2);
    expect(result.assigned).toEqual([
      { eventId: 'e1', globalSequence: GlobalSequenceNumber.from(1) },
      { eventId: 'e2', globalSequence: GlobalSequenceNumber.from(2) },
    ]);
    expect(db.stores[0]?.head).toBe(2);
  });

  it('returns existing assignments for idempotent events', async () => {
    const db = new FakeDb();
    db.stores.push({
      store_id: 'store-1',
      owner_identity_id: 'owner-1',
      head: 1,
    });
    db.events.push({
      owner_identity_id: 'owner-1',
      store_id: 'store-1',
      global_seq: 1,
      event_id: 'e1',
      record_json: '{"a":1}',
      created_at: new Date(),
    });
    const repo = new KyselySyncEventRepository(makeDbService(db));

    const result = await repo.appendBatch({
      ownerId: SyncOwnerId.from('owner-1'),
      storeId: SyncStoreId.from('store-1'),
      expectedHead: GlobalSequenceNumber.from(1),
      events: [{ eventId: 'e1', recordJson: '{"a":1}' }],
    });

    expect(result.assigned).toEqual([
      { eventId: 'e1', globalSequence: GlobalSequenceNumber.from(1) },
    ]);
    expect(result.head.unwrap()).toBe(1);
  });

  it('throws when head mismatches', async () => {
    const db = new FakeDb();
    db.stores.push({
      store_id: 'store-1',
      owner_identity_id: 'owner-1',
      head: 2,
    });
    const repo = new KyselySyncEventRepository(makeDbService(db));

    await expect(
      repo.appendBatch({
        ownerId: SyncOwnerId.from('owner-1'),
        storeId: SyncStoreId.from('store-1'),
        expectedHead: GlobalSequenceNumber.from(1),
        events: [{ eventId: 'e1', recordJson: '{"a":1}' }],
      })
    ).rejects.toBeInstanceOf(SyncRepositoryHeadMismatchError);
  });
});
