import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import * as SQLiteConstants from 'wa-sqlite/src/sqlite-constants.js';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import type { SqliteBatchResult, SqliteStatement, SqliteValue } from '../types';
import { PlatformErrorCodes, type PlatformError } from '@mo/eventstore-core';
import { applySchema } from './schema';

type SqliteApi = ReturnType<typeof SQLite.Factory>;
type VfsWithClose = SQLiteVFS & {
  close?: () => void | Promise<void>;
  isReady?: Promise<void>;
  name?: string;
};

export type SqliteContext = Readonly<{
  sqlite3: SqliteApi;
  db: number;
  vfsName: string;
  vfs: VfsWithClose;
}>;

const SQLITE_ROW = SQLiteConstants.SQLITE_ROW;
const SQLITE_DONE = SQLiteConstants.SQLITE_DONE;

export async function createSqliteContext(options: {
  storeId: string;
  dbName: string;
}): Promise<SqliteContext> {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfsSeed = `mo-eventstore-${options.storeId}`;
  const vfs = new AccessHandlePoolVFS(vfsSeed) as VfsWithClose;
  if (vfs.isReady) {
    await vfs.isReady;
  }
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(
    options.dbName,
    SQLiteConstants.SQLITE_OPEN_CREATE | SQLiteConstants.SQLITE_OPEN_READWRITE
  );
  await sqlite3.exec(db, 'PRAGMA journal_mode = DELETE');
  await sqlite3.exec(db, 'PRAGMA synchronous = FULL');
  const ctx: SqliteContext = {
    sqlite3,
    db,
    vfsName:
      typeof vfs.name === 'string' && vfs.name.length > 0 ? vfs.name : vfsSeed,
    vfs,
  };
  await applySchema(ctx);
  return ctx;
}

export async function closeSqliteContext(ctx: SqliteContext): Promise<void> {
  await ctx.sqlite3.close(ctx.db);
  await ctx.vfs.close?.();
}

export async function executeStatements(
  ctx: SqliteContext,
  statements: ReadonlyArray<SqliteStatement>
): Promise<ReadonlyArray<SqliteBatchResult>> {
  const results: SqliteBatchResult[] = [];
  const sqlite3 = ctx.sqlite3;
  await sqlite3.exec(ctx.db, 'BEGIN');
  try {
    for (const statement of statements) {
      if (statement.kind === 'execute') {
        await runExecute(
          sqlite3,
          ctx.db,
          statement.sql,
          statement.params ?? []
        );
        results.push({ kind: 'execute' });
      } else {
        const rows = await runQuery(
          sqlite3,
          ctx.db,
          statement.sql,
          statement.params ?? []
        );
        results.push({ kind: 'query', rows });
      }
    }
    await sqlite3.exec(ctx.db, 'COMMIT');
    return results;
  } catch (error) {
    try {
      await sqlite3.exec(ctx.db, 'ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export async function runQuery(
  sqlite3: SqliteApi,
  db: number,
  sql: string,
  params: ReadonlyArray<SqliteValue>
): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> {
  const rows: Readonly<Record<string, unknown>>[] = [];
  const stmts = sqlite3.statements(db, sql);
  try {
    for await (const stmt of stmts) {
      if (params.length > 0) {
        sqlite3.bind_collection(stmt, Array.from(params));
      }
      const columns = sqlite3.column_names(stmt);
      while (true) {
        const rc = await sqlite3.step(stmt);
        if (rc === SQLITE_ROW) {
          const rowValues = sqlite3.row(stmt).map(normalizeSqliteValue);
          const row: Record<string, unknown> = {};
          for (let i = 0; i < columns.length; i += 1) {
            row[columns[i]] = rowValues[i];
          }
          rows.push(row);
        } else if (rc === SQLITE_DONE) {
          break;
        } else {
          throw new Error(`SQLite step error: ${rc}`);
        }
      }
    }
  } finally {
    for await (const stmt of stmts) {
      sqlite3.finalize(stmt);
    }
  }
  return rows;
}

export async function runExecute(
  sqlite3: SqliteApi,
  db: number,
  sql: string,
  params: ReadonlyArray<SqliteValue>
): Promise<void> {
  const stmts = sqlite3.statements(db, sql);
  try {
    for await (const stmt of stmts) {
      if (params.length > 0) {
        sqlite3.bind_collection(stmt, Array.from(params));
      }
      while (true) {
        const rc = await sqlite3.step(stmt);
        if (rc === SQLITE_ROW) {
          continue;
        }
        if (rc === SQLITE_DONE) {
          break;
        }
        throw new Error(`SQLite step error: ${rc}`);
      }
    }
  } finally {
    for await (const stmt of stmts) {
      sqlite3.finalize(stmt);
    }
  }
}

export function normalizeSqliteValue(value: unknown): SqliteValue {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (!Number.isSafeInteger(asNumber)) {
      throw new Error('SQLite integer exceeds JS safe integer range');
    }
    return asNumber;
  }
  throw new Error(`Unsupported SQLite value type: ${typeof value}`);
}

export function toPlatformError(error: unknown): PlatformError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : null;
  if (code) {
    if (code.includes('CONSTRAINT')) {
      return {
        code: PlatformErrorCodes.ConstraintViolationError,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (code.includes('BUSY') || code.includes('LOCKED')) {
      return {
        code: PlatformErrorCodes.DbLockedError,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (code.includes('ABORT')) {
      return {
        code: PlatformErrorCodes.TransactionAbortedError,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    code: PlatformErrorCodes.WorkerProtocolError,
    message: error instanceof Error ? error.message : 'Unknown error',
  };
}

export function extractTableNames(sql: string): ReadonlyArray<string> {
  const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
  const matches: string[] = [];
  const insertMatch = /INSERT\s+INTO\s+([A-Z0-9_]+)/.exec(normalized);
  if (insertMatch) matches.push(insertMatch[1]);
  const updateMatch = /UPDATE\s+([A-Z0-9_]+)/.exec(normalized);
  if (updateMatch) matches.push(updateMatch[1]);
  const deleteMatch = /DELETE\s+FROM\s+([A-Z0-9_]+)/.exec(normalized);
  if (deleteMatch) matches.push(deleteMatch[1]);
  const createMatch = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Z0-9_]+)/.exec(
    normalized
  );
  if (createMatch) matches.push(createMatch[1]);
  const dropMatch = /DROP\s+TABLE\s+IF\s+EXISTS\s+([A-Z0-9_]+)/.exec(
    normalized
  );
  if (dropMatch) matches.push(dropMatch[1]);
  return Array.from(new Set(matches));
}
