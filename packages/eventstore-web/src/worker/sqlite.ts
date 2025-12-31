import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
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
const SQLITE_OK = SQLiteConstants.SQLITE_OK;

const SqliteInitStages = {
  loadWasm: 'loadWasm',
  initModule: 'initModule',
  createVfs: 'createVfs',
  awaitVfsReady: 'awaitVfsReady',
  addVfsCapacity: 'addVfsCapacity',
  vfsRegister: 'vfsRegister',
  openDb: 'openDb',
  applyPragmas: 'applyPragmas',
  applySchema: 'applySchema',
} as const;

type SqliteInitStage = (typeof SqliteInitStages)[keyof typeof SqliteInitStages];

export class SqliteInitError extends Error {
  readonly stage: SqliteInitStage;
  readonly cause: unknown;

  constructor(stage: SqliteInitStage, cause: unknown, message: string) {
    super(message);
    this.name = 'SqliteInitError';
    this.stage = stage;
    this.cause = cause;
  }
}

type VfsWithCapacity = VfsWithClose & {
  addCapacity: (capacity: number) => Promise<void> | void;
};

const hasAddCapacity = (vfs: VfsWithClose): vfs is VfsWithCapacity => {
  const candidate = (vfs as { addCapacity?: unknown }).addCapacity;
  return typeof candidate === 'function';
};

type VfsWithGetCapacity = VfsWithClose & {
  getCapacity: () => number;
};

const hasGetCapacity = (vfs: VfsWithClose): vfs is VfsWithGetCapacity => {
  const candidate = (vfs as { getCapacity?: unknown }).getCapacity;
  return typeof candidate === 'function';
};

type VfsWithRemoveCapacity = VfsWithClose & {
  removeCapacity: (capacity: number) => Promise<number> | number;
};

const hasRemoveCapacity = (vfs: VfsWithClose): vfs is VfsWithRemoveCapacity => {
  const candidate = (vfs as { removeCapacity?: unknown }).removeCapacity;
  return typeof candidate === 'function';
};

const withInitStage = async <T>(
  stage: SqliteInitStage,
  label: string,
  fn: () => Promise<T>
): Promise<T> => {
  try {
    return await fn();
  } catch (cause) {
    throw new SqliteInitError(stage, cause, `SQLite init failed at ${label}`);
  }
};

export async function createSqliteContext(options: {
  storeId: string;
  dbName: string;
}): Promise<SqliteContext> {
  const { url: resolvedWasmUrl, bytes: wasmBinary } = await withInitStage(
    SqliteInitStages.loadWasm,
    'wasm',
    async () =>
      loadWasmBinary([
        wasmUrl,
        new URL('wa-sqlite.wasm', import.meta.url).toString(),
      ])
  );

  const module = await withInitStage(
    SqliteInitStages.initModule,
    'SQLiteESMFactory',
    async () =>
      SQLiteESMFactory({
        locateFile: () => resolvedWasmUrl,
        wasmBinary,
      })
  );

  const sqlite3 = SQLite.Factory(module);
  const vfsSeed = `mo-eventstore-${options.storeId}`;
  const vfs = await withInitStage(
    SqliteInitStages.createVfs,
    'create VFS',
    async () => new AccessHandlePoolVFS(vfsSeed) as VfsWithClose
  );

  if (vfs.isReady) {
    await withInitStage(
      SqliteInitStages.awaitVfsReady,
      'await VFS ready',
      async () => vfs.isReady
    );
  }

  // IMPORTANT: AccessHandlePoolVFS persists pooled files in OPFS.
  // Calling addCapacity(N) on every boot grows the directory unboundedly,
  // which can eventually cause Safari to throw `InvalidStateError` during
  // VFS initialization (it tries to reopen every pooled file).
  if (hasAddCapacity(vfs)) {
    const targetCapacity = 12;
    if (hasGetCapacity(vfs)) {
      const currentCapacity = vfs.getCapacity();
      if (
        Number.isFinite(currentCapacity) &&
        currentCapacity < targetCapacity
      ) {
        await withInitStage(
          SqliteInitStages.addVfsCapacity,
          'ensure VFS capacity',
          async () => vfs.addCapacity(targetCapacity - currentCapacity)
        );
      }
      if (hasRemoveCapacity(vfs) && currentCapacity > targetCapacity * 4) {
        // Best-effort: trim huge pools created by older builds.
        try {
          await vfs.removeCapacity(currentCapacity - targetCapacity);
        } catch {
          // ignore trim failures (may be constrained by active associations)
        }
      }
    } else {
      await withInitStage(
        SqliteInitStages.addVfsCapacity,
        'add VFS capacity',
        async () => vfs.addCapacity(targetCapacity)
      );
    }
  }

  await withInitStage(
    SqliteInitStages.vfsRegister,
    'vfs_register',
    async () => {
      sqlite3.vfs_register(vfs, true);
    }
  );

  const dbPath = options.dbName.startsWith('/')
    ? options.dbName
    : `/${options.dbName}`;
  const db = await withInitStage(SqliteInitStages.openDb, 'open_v2', async () =>
    sqlite3.open_v2(
      dbPath,
      SQLiteConstants.SQLITE_OPEN_CREATE | SQLiteConstants.SQLITE_OPEN_READWRITE
    )
  );

  await withInitStage(SqliteInitStages.applyPragmas, 'PRAGMAs', async () => {
    await sqlite3.exec(db, 'PRAGMA journal_mode = DELETE');
    await sqlite3.exec(db, 'PRAGMA synchronous = FULL');
  });
  const ctx: SqliteContext = {
    sqlite3,
    db,
    vfsName:
      typeof vfs.name === 'string' && vfs.name.length > 0 ? vfs.name : vfsSeed,
    vfs,
  };
  await withInitStage(SqliteInitStages.applySchema, 'applySchema', async () =>
    applySchema(ctx)
  );
  return ctx;
}

async function loadWasmBinary(
  candidates: ReadonlyArray<string>
): Promise<{ url: string; bytes: Uint8Array }> {
  let lastError: unknown = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(
          `Failed to load wa-sqlite wasm: ${response.status}`
        );
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { url, bytes };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Failed to load wa-sqlite wasm');
}

export async function closeSqliteContext(ctx: SqliteContext): Promise<void> {
  await ctx.sqlite3.close(ctx.db);
  await ctx.vfs.close?.();
}

export function exportVfsFileBytes(
  ctx: SqliteContext,
  path: string
): Uint8Array {
  const dbPath = path.startsWith('/') ? path : `/${path}`;

  const fileId =
    Number.MAX_SAFE_INTEGER - Math.floor(Math.random() * 10_000) - 1;
  const outFlags = new DataView(new ArrayBuffer(4));
  const rcOpen = ctx.vfs.xOpen(
    dbPath,
    fileId,
    SQLiteConstants.SQLITE_OPEN_MAIN_DB | SQLiteConstants.SQLITE_OPEN_READONLY,
    outFlags
  );
  if (rcOpen !== SQLITE_OK) {
    throw new Error(`VFS xOpen failed: ${rcOpen}`);
  }

  try {
    const sizeView = new DataView(new ArrayBuffer(8));
    const rcSize = ctx.vfs.xFileSize(fileId, sizeView);
    if (rcSize !== SQLITE_OK) {
      throw new Error(`VFS xFileSize failed: ${rcSize}`);
    }
    const size = Number(sizeView.getBigInt64(0, true));
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Invalid VFS file size');
    }

    const bytes = new Uint8Array(size);
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const length = Math.min(chunkSize, size - offset);
      const view = bytes.subarray(offset, offset + length);
      const rcRead = ctx.vfs.xRead(fileId, view, offset);
      if (rcRead !== SQLITE_OK) {
        throw new Error(`VFS xRead failed at offset ${offset}: ${rcRead}`);
      }
    }

    return bytes;
  } finally {
    ctx.vfs.xClose(fileId);
  }
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
  const insertMatch = /INSERT(?:\s+OR\s+[A-Z_]+)?\s+INTO\s+([A-Z0-9_]+)/.exec(
    normalized
  );
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
