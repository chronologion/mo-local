import type { Unsubscribe } from '@mo/eventstore-core';

export type SqliteValue = string | number | Uint8Array | null;

export type SqliteTableName = string;

export const ChangeOperations = {
  insert: 'insert',
  update: 'update',
  delete: 'delete',
} as const;

export type ChangeOperation = (typeof ChangeOperations)[keyof typeof ChangeOperations];

export const ChangeHintKinds = {
  tableInvalidated: 'tableInvalidated',
  rowsChanged: 'rowsChanged',
} as const;

export type ChangeHintKind = (typeof ChangeHintKinds)[keyof typeof ChangeHintKinds];

export type ChangeHint =
  | Readonly<{
      kind: typeof ChangeHintKinds.tableInvalidated;
      table: SqliteTableName;
    }>
  | Readonly<{
      kind: typeof ChangeHintKinds.rowsChanged;
      table: SqliteTableName;
      operation: ChangeOperation;
      rowids: ReadonlyArray<number>;
    }>;

export const SqliteStatementKinds = {
  execute: 'execute',
  query: 'query',
} as const;

export type SqliteStatementKind = (typeof SqliteStatementKinds)[keyof typeof SqliteStatementKinds];

export type SqliteStatement =
  | Readonly<{
      kind: typeof SqliteStatementKinds.execute;
      sql: string;
      params?: ReadonlyArray<SqliteValue>;
    }>
  | Readonly<{
      kind: typeof SqliteStatementKinds.query;
      sql: string;
      params?: ReadonlyArray<SqliteValue>;
    }>;

export type SqliteBatchResult =
  | Readonly<{ kind: typeof SqliteStatementKinds.execute }>
  | Readonly<{
      kind: typeof SqliteStatementKinds.query;
      rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
    }>;

export interface SqliteDbPort {
  /**
   * Execute a SQL query and return rows as plain objects.
   */
  query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params?: ReadonlyArray<SqliteValue>
  ): Promise<ReadonlyArray<T>>;

  /**
   * Execute a SQL statement with no returned rows.
   */
  execute(sql: string, params?: ReadonlyArray<SqliteValue>): Promise<void>;

  /**
   * Execute multiple statements atomically in a single transaction.
   * All statements succeed or all are rolled back.
   */
  batch(statements: ReadonlyArray<SqliteStatement>): Promise<ReadonlyArray<SqliteBatchResult>>;

  /**
   * Subscribe to table-level invalidations.
   */
  subscribeToTables(tables: ReadonlyArray<SqliteTableName>, listener: () => void): Unsubscribe;

  subscribeToChanges?(
    tables: ReadonlyArray<SqliteTableName>,
    listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): Unsubscribe;

  /**
   * DEV-only helper: exports the main SQLite database file bytes.
   * Not supported by all adapters.
   */
  exportMainDatabase?: () => Promise<Uint8Array>;

  /**
   * DEV-only helper: replaces the main SQLite database file with the given bytes.
   * Intended for restoring `Download DB` backups in development.
   */
  importMainDatabase?: (bytes: Uint8Array) => Promise<void>;
}
