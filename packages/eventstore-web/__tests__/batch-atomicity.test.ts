import { describe, expect, it } from 'vitest';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import * as SQLiteConstants from 'wa-sqlite/src/sqlite-constants.js';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { executeStatements, runQuery } from '../src/worker/sqlite';
import type { SqliteContext } from '../src/worker/sqlite';

async function createMemoryContext(): Promise<SqliteContext> {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(
    'test.db',
    SQLiteConstants.SQLITE_OPEN_CREATE | SQLiteConstants.SQLITE_OPEN_READWRITE,
    vfs.name
  );
  return { sqlite3, db, vfsName: 'memory', vfs };
}

const isNode = typeof process !== 'undefined' && !!process.versions?.node;
const describeIfBrowser = isNode ? describe.skip : describe;
// Browser-only: wa-sqlite wasm fetch + OPFS APIs are unavailable in Node.

describeIfBrowser('batch atomicity', () => {
  it('rolls back when a statement fails', async () => {
    const ctx = await createMemoryContext();
    await ctx.sqlite3.exec(
      ctx.db,
      'CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT)'
    );

    await expect(
      executeStatements(ctx, [
        {
          kind: 'execute',
          sql: 'INSERT INTO demo (id, name) VALUES (?, ?)',
          params: [1, 'a'],
        },
        {
          kind: 'execute',
          sql: 'INSERT INTO missing_table (id) VALUES (?)',
          params: [2],
        },
      ])
    ).rejects.toThrow();

    const rows = await runQuery(
      ctx.sqlite3,
      ctx.db,
      'SELECT COUNT(*) as count FROM demo',
      []
    );
    expect(rows[0]?.count).toBe(0);
  });

  it('persists data across reopen within the same VFS', async () => {
    const ctx = await createMemoryContext();
    await ctx.sqlite3.exec(
      ctx.db,
      'CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT)'
    );
    await ctx.sqlite3.exec(
      ctx.db,
      'INSERT INTO demo (id, name) VALUES (1, "a")'
    );
    await ctx.sqlite3.close(ctx.db);

    const db2 = await ctx.sqlite3.open_v2(
      'test.db',
      SQLiteConstants.SQLITE_OPEN_CREATE |
        SQLiteConstants.SQLITE_OPEN_READWRITE,
      ctx.vfs.name
    );
    const rows = await runQuery(
      ctx.sqlite3,
      db2,
      'SELECT COUNT(*) as count FROM demo',
      []
    );
    expect(rows[0]?.count).toBe(1);
  });
});
