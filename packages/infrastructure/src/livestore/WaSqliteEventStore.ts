import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from '@livestore/wa-sqlite';
import type { SQLiteAPI, SQLiteVFS } from '@livestore/wa-sqlite';
import { AccessHandlePoolVFS } from '@livestore/wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { MemoryVFS } from '@livestore/wa-sqlite/src/examples/MemoryVFS.js';
import {
  ConcurrencyError,
  type EncryptedEvent,
  type EventFilter,
  type IEventStore,
} from '@mo/application';
import { migrations } from './migrations';

type VfsRegistration = {
  name: string;
  close?: () => Promise<void>;
};

type VfsFactory = (
  sqlite: SQLiteAPI,
  module: Awaited<ReturnType<typeof SQLiteESMFactory>>
) => Promise<VfsRegistration>;

type NavigatorLike = {
  navigator?: {
    storage?: {
      getDirectory?: () => Promise<unknown>;
    };
  };
};

type EventRow = {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  version: number;
  occurred_at: number;
  sequence: number;
};

const DEFAULT_DB_NAME = '/opfs/mo-local.db';

type SQLiteCompatibleType =
  | number
  | string
  | Uint8Array
  | Array<number>
  | bigint
  | null;

type SQLiteModuleOptions = {
  wasmBinary?: ArrayBuffer | Uint8Array;
};

class SqliteDatabase {
  constructor(
    private readonly sqlite: SQLiteAPI,
    private readonly handle: number
  ) {}

  get db(): number {
    return this.handle;
  }

  private async iterate(
    sql: string,
    params:
      | SQLiteCompatibleType[]
      | Record<string, SQLiteCompatibleType>
      | null,
    onRow?: (stmt: number) => void
  ): Promise<void> {
    for await (const stmt of this.sqlite.statements(this.handle, sql, {
      unscoped: true,
    })) {
      if (typeof stmt !== 'number') {
        continue;
      }
      if (params) {
        this.sqlite.bind_collection(stmt, params as never);
      }
      while ((await this.sqlite.step(stmt)) === SQLite.SQLITE_ROW) {
        onRow?.(stmt);
      }
      await this.sqlite.finalize(stmt);
    }
  }

  async run(
    sql: string,
    params?:
      | SQLiteCompatibleType[]
      | Record<string, SQLiteCompatibleType>
      | null
  ): Promise<void> {
    if (!params) {
      await this.sqlite.exec(this.handle, sql);
      return;
    }
    await this.iterate(sql, params);
  }

  async get<T>(
    sql: string,
    params?: SQLiteCompatibleType[] | Record<string, SQLiteCompatibleType>
  ): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async exec(
    sql: string,
    callback?: (
      row: SQLiteCompatibleType[],
      columns: string[]
    ) => void | Promise<void>
  ): Promise<void> {
    await this.sqlite.exec(this.handle, sql, callback);
  }

  async all<T>(
    sql: string,
    params?: SQLiteCompatibleType[] | Record<string, SQLiteCompatibleType>
  ): Promise<T[]> {
    const rows: T[] = [];
    await this.iterate(sql, params ?? null, (stmt) => {
      const columns = this.sqlite.column_names(stmt);
      const values = this.sqlite.row(stmt);
      const mapped: Record<string, SQLiteCompatibleType> = {};
      columns.forEach((column, idx) => {
        mapped[column] = values[idx] as SQLiteCompatibleType;
      });
      rows.push(mapped as unknown as T);
    });
    return rows;
  }

  async transaction(work: () => Promise<void>): Promise<void> {
    await this.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      await work();
      await this.exec('COMMIT;');
    } catch (error) {
      await this.exec('ROLLBACK;');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.sqlite.close(this.handle);
  }
}

const hasOpfsSupport = (scope: NavigatorLike): boolean => {
  const nav = scope.navigator;
  const storage = nav?.storage;
  return Boolean(storage && typeof storage.getDirectory === 'function');
};

const hasSyncAccessHandle = (scope: { FileSystemSyncAccessHandle?: unknown }) =>
  typeof scope.FileSystemSyncAccessHandle !== 'undefined';

const defaultVfsFactory: VfsFactory = async (sqlite, module) => {
  const tryMemoryVfs = () => {
    const memoryVfs = new (MemoryVFS as unknown as {
      new (name: string, module: unknown): unknown;
    })('memory', module);
    const vfs = memoryVfs as SQLiteVFS;
    sqlite.vfs_register(vfs, true);
    return {
      name: vfs.name,
      close:
        typeof (vfs as { close?: () => Promise<void> | void }).close ===
        'function'
          ? () =>
              Promise.resolve(
                (vfs as { close?: () => Promise<void> | void }).close!()
              )
          : undefined,
    };
  };

  const tryAccessHandleVfs = async () => {
    const scope = globalThis as NavigatorLike & {
      FileSystemSyncAccessHandle?: unknown;
    };
    if (hasOpfsSupport(scope) && hasSyncAccessHandle(scope)) {
      const vfs = (await AccessHandlePoolVFS.create(
        'opfs',
        module
      )) as unknown as SQLiteVFS;
      sqlite.vfs_register(vfs, true);
      return { name: vfs.name, close: () => Promise.resolve(vfs.close?.()) };
    }
    return null;
  };

  try {
    const accessHandle = await tryAccessHandleVfs();
    if (accessHandle) return accessHandle;
  } catch (error) {
    console.warn('AccessHandlePoolVFS failed, falling back to memory', error);
  }

  return tryMemoryVfs();
};

export class WaSqliteEventStore implements IEventStore {
  private constructor(
    private readonly sqlite: SQLiteAPI,
    private readonly database: SqliteDatabase,
    private readonly vfs?: VfsRegistration
  ) {}

  static async initialize(options?: {
    filename?: string;
    vfsFactory?: VfsFactory;
    moduleOptions?: SQLiteModuleOptions;
  }): Promise<WaSqliteEventStore> {
    const module = await SQLiteESMFactory(options?.moduleOptions);
    const sqlite = SQLite.Factory(module);
    const vfs = await (options?.vfsFactory ?? defaultVfsFactory)(
      sqlite,
      module
    );
    const dbName = options?.filename ?? DEFAULT_DB_NAME;
    const handle = await sqlite.open_v2(
      dbName,
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name
    );
    const database = new SqliteDatabase(sqlite, handle);
    const store = new WaSqliteEventStore(sqlite, database, vfs);
    await store.migrate();
    return store;
  }

  getVfsName(): string {
    return this.vfs?.name ?? 'unknown';
  }

  async append(aggregateId: string, events: EncryptedEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.database.transaction(async () => {
      const current = await this.database.get<{ maxVersion: number }>(
        'SELECT MAX(version) as maxVersion FROM goal_events WHERE aggregate_id = ?',
        [aggregateId]
      );
      const currentVersion = current?.maxVersion ?? 0;
      const expectedStart = currentVersion + 1;

      events.forEach((event, idx) => {
        const expectedVersion = expectedStart + idx;
        if (event.version !== expectedVersion) {
          throw new ConcurrencyError(
            `Expected version ${expectedVersion} but received ${event.version} for ${aggregateId}`
          );
        }
      });

      for (const event of events) {
        await this.database.run(
          'INSERT INTO goal_events (id, aggregate_id, event_type, payload_encrypted, version, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            event.id,
            aggregateId,
            event.eventType,
            event.payload,
            event.version,
            event.occurredAt,
          ]
        );
      }
    });
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    const rows = await this.database.all<EventRow>(
      'SELECT id, aggregate_id, event_type, payload_encrypted, version, occurred_at, sequence FROM goal_events WHERE aggregate_id = ? AND version >= ? ORDER BY version ASC',
      [aggregateId, fromVersion]
    );
    return rows.map((row) => this.toEncryptedEvent(row));
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    const conditions: string[] = [];
    const params: SQLiteCompatibleType[] = [];

    if (filter?.aggregateId) {
      conditions.push('aggregate_id = ?');
      params.push(filter.aggregateId);
    }
    if (filter?.eventType) {
      conditions.push('event_type = ?');
      params.push(filter.eventType);
    }
    if (filter?.since) {
      conditions.push('sequence > ?');
      params.push(filter.since);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filter?.limit ? 'LIMIT ?' : '';
    if (filter?.limit) {
      params.push(filter.limit);
    }

    const rows = await this.database.all<EventRow>(
      `SELECT id, aggregate_id, event_type, payload_encrypted, version, occurred_at, sequence FROM goal_events ${whereClause} ORDER BY sequence ASC ${limitClause}`,
      params
    );
    return rows.map((row) => this.toEncryptedEvent(row));
  }

  async close(): Promise<void> {
    await this.database.close();
    if (this.vfs?.close) {
      await this.vfs.close();
    }
  }

  /**
   * Internal helper for diagnostics in tests.
   */
  async debugListTables(): Promise<string[]> {
    const rows = await this.database.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    );
    return rows.map((row) => row.name);
  }

  private async migrate(): Promise<void> {
    await this.database.exec('PRAGMA foreign_keys = ON');
    let currentVersion = await this.readUserVersion();

    const sorted = [...migrations].sort((a, b) => a.from - b.from);

    for (const step of sorted) {
      if (step.from !== currentVersion) continue;
      await this.database.transaction(async () => {
        for (const statement of step.up) {
          await this.database.run(statement);
        }
        await this.database.exec(`PRAGMA user_version = ${step.to}`);
      });
      currentVersion = step.to;
    }
  }

  private async readUserVersion(): Promise<number> {
    let currentVersion = 0;
    await this.database.exec(
      'PRAGMA user_version',
      (row, columns: string[]) => {
        const idx = columns.findIndex((name) => name === 'user_version');
        const value = idx >= 0 ? row[idx] : null;
        if (typeof value === 'number') {
          currentVersion = value;
        } else if (typeof value === 'bigint') {
          currentVersion = Number(value);
        }
      }
    );
    return currentVersion;
  }

  private toEncryptedEvent(row: EventRow): EncryptedEvent {
    return {
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: row.version,
      occurredAt: row.occurred_at,
      sequence: row.sequence,
    };
  }
}
