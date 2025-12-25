import { describe, expect, it } from 'vitest';
import { KyselySyncStoreRepository } from '../../sync/infrastructure/kysely-sync-store.repository';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import { SyncAccessDeniedError } from '../../sync/application/ports/sync-access-policy';
import type { SyncDatabaseService } from '../../sync/infrastructure/database.service';

type StoreRow = { store_id: string; owner_identity_id: string };
type EventRow = { owner_identity_id: string; store_id: string };

type WhereClause = {
  column: string;
  value: string;
};

class FakeCountQuery {
  constructor(
    private readonly rows: EventRow[],
    private readonly whereClauses: WhereClause[]
  ) {}

  where(column: string, _op: '=', value: string): FakeCountQuery {
    return new FakeCountQuery(this.rows, [
      ...this.whereClauses,
      { column, value },
    ]);
  }

  executeTakeFirst(): { count: number } {
    const filtered = this.rows.filter((row) =>
      this.whereClauses.every((clause) => {
        const key = clause.column as keyof EventRow;
        return row[key] === clause.value;
      })
    );
    return { count: filtered.length };
  }
}

class FakeInsert {
  constructor(
    private readonly stores: StoreRow[],
    private readonly row: StoreRow
  ) {}

  onConflict(): this {
    return this;
  }

  execute(): void {
    const existing = this.stores.find((s) => s.store_id === this.row.store_id);
    if (!existing) {
      this.stores.push({ ...this.row });
    }
  }
}

class FakeUpdate {
  private whereClauses: WhereClause[] = [];
  private values: Partial<StoreRow> & Partial<EventRow> = {};
  constructor(private readonly rows: StoreRow[] | EventRow[]) {}

  set(values: Partial<StoreRow> & Partial<EventRow>): this {
    this.values = { ...this.values, ...values };
    return this;
  }

  where(column: string, _op: '=', value: string): this {
    this.whereClauses.push({ column, value });
    return this;
  }

  execute(): void {
    this.rows.forEach((row) => {
      if (
        this.whereClauses.every((clause) => {
          const key = clause.column as keyof typeof row;
          return row[key] === clause.value;
        })
      ) {
        Object.assign(row, this.values);
      }
    });
    return;
  }
}

class FakeDb {
  stores: StoreRow[] = [];
  events: EventRow[] = [];
}

const makeSelectBuilder = <T extends StoreRow | EventRow>(
  rows: T[],
  whereClauses: WhereClause[] = [],
  mode: 'rows' | 'count' = 'rows'
) => ({
  select: (arg: unknown) =>
    makeSelectBuilder(
      rows,
      whereClauses,
      typeof arg === 'function' ? 'count' : mode
    ),
  where: (column: string, _op: '=', value: string) =>
    makeSelectBuilder(rows, [...whereClauses, { column, value }], mode),
  execute: () => {
    const filtered = rows.filter((row) =>
      whereClauses.every((clause) => {
        const key = clause.column as keyof T;
        return row[key] === clause.value;
      })
    );
    return mode === 'count' ? [{ count: filtered.length }] : filtered;
  },
  executeTakeFirst: () => {
    const filtered = rows.filter((row) =>
      whereClauses.every((clause) => {
        const key = clause.column as keyof T;
        return row[key] === clause.value;
      })
    );
    return mode === 'count' ? { count: filtered.length } : filtered[0];
  },
});

type SelectBuilder = ReturnType<typeof makeSelectBuilder>;
type FakeTrx = {
  selectFrom: (table: 'sync.stores' | 'sync.events') => SelectBuilder;
  insertInto: (table: 'sync.stores') => {
    values: (row: StoreRow) => FakeInsert;
  };
  updateTable: (table: 'sync.events' | 'sync.stores') => FakeUpdate;
};

const makeDbService = (db: FakeDb): SyncDatabaseService =>
  ({
    getDb: () => ({
      transaction: () => ({
        execute: (fn: (trx: FakeTrx) => Promise<void>) =>
          fn({
            selectFrom: (table: 'sync.stores' | 'sync.events') =>
              table === 'sync.stores'
                ? makeSelectBuilder(db.stores)
                : makeSelectBuilder(db.events),
            insertInto: (_table: 'sync.stores') => ({
              values: (row: StoreRow) => new FakeInsert(db.stores, row),
            }),
            updateTable: (table: 'sync.events' | 'sync.stores') =>
              new FakeUpdate(table === 'sync.events' ? db.events : db.stores),
          }),
      }),
      selectFrom: (table: 'sync.stores' | 'sync.events') => {
        if (table === 'sync.stores') {
          return makeSelectBuilder(db.stores);
        }
        return {
          select: (_: unknown) => ({
            where: (column: string, _op: '=', value: string) =>
              new FakeCountQuery(db.events, [{ column, value }]),
          }),
        };
      },
      insertInto: (_table: 'sync.stores') => ({
        values: (row: StoreRow) => ({
          onConflict: () => ({
            execute: () => {
              const existing = db.stores.find(
                (store) => store.store_id === row.store_id
              );
              if (!existing) {
                db.stores.push({ ...row });
              }
            },
          }),
        }),
      }),
      updateTable: (table: 'sync.events' | 'sync.stores') =>
        new FakeUpdate(table === 'sync.events' ? db.events : db.stores),
    }),
  }) as unknown as SyncDatabaseService;

describe('KyselySyncStoreRepository', () => {
  it('inserts the first store for an owner', async () => {
    const db = new FakeDb();
    const repo = new KyselySyncStoreRepository(makeDbService(db));
    await repo.ensureStoreOwner(
      SyncStoreId.from('store-1'),
      SyncOwnerId.from('owner-1')
    );
    expect(db.stores).toEqual([
      { store_id: 'store-1', owner_identity_id: 'owner-1' },
    ]);
  });

  it('rejects if store owned by different identity', async () => {
    const db = new FakeDb();
    db.stores.push({ store_id: 'store-1', owner_identity_id: 'owner-1' });
    const repo = new KyselySyncStoreRepository(makeDbService(db));
    await expect(
      repo.ensureStoreOwner(
        SyncStoreId.from('store-1'),
        SyncOwnerId.from('owner-2')
      )
    ).rejects.toBeInstanceOf(SyncAccessDeniedError);
  });

  it('migrates legacy store to new id when no events exist', async () => {
    const db = new FakeDb();
    db.stores.push({
      store_id: 'mo-local-v2-legacy',
      owner_identity_id: 'owner-1',
    });
    db.events.push({
      owner_identity_id: 'owner-1',
      store_id: 'mo-local-v2-legacy',
    });
    const repo = new KyselySyncStoreRepository(makeDbService(db));
    await repo.ensureStoreOwner(
      SyncStoreId.from('store-1'),
      SyncOwnerId.from('owner-1')
    );
    expect(db.stores[0]?.store_id).toBe('store-1');
    expect(db.events[0]?.store_id).toBe('store-1');
  });

  it('rejects migration if new store already has events', async () => {
    const db = new FakeDb();
    db.stores.push({
      store_id: 'mo-local-v2-legacy',
      owner_identity_id: 'owner-1',
    });
    db.events.push({ owner_identity_id: 'owner-1', store_id: 'store-1' });
    const repo = new KyselySyncStoreRepository(makeDbService(db));
    await expect(
      repo.ensureStoreOwner(
        SyncStoreId.from('store-1'),
        SyncOwnerId.from('owner-1')
      )
    ).rejects.toBeInstanceOf(SyncAccessDeniedError);
  });

  it('rejects multiple stores for same identity', async () => {
    const db = new FakeDb();
    db.stores.push({ store_id: 'mo-local-v2-a', owner_identity_id: 'owner-1' });
    db.stores.push({ store_id: 'mo-local-v2-b', owner_identity_id: 'owner-1' });
    const repo = new KyselySyncStoreRepository(makeDbService(db));
    await expect(
      repo.ensureStoreOwner(
        SyncStoreId.from('store-1'),
        SyncOwnerId.from('owner-1')
      )
    ).rejects.toBeInstanceOf(SyncAccessDeniedError);
  });
});
