import { describe, expect, it } from 'vitest';
import { applySchema } from '../src/worker/schema';
import { PlatformErrorCodes } from '@mo/eventstore-core';
import type { SqliteContext } from '../src/worker/sqlite';

type ExecCall = {
  sql: string;
};

const createContext = (userVersion: number) => {
  const executed: ExecCall[] = [];
  const sqlite3 = {
    exec: async (_db: number, sql: string, callback?: (row: ReadonlyArray<unknown>) => void) => {
      if (sql.startsWith('PRAGMA user_version') && callback) {
        callback([userVersion]);
        return;
      }
      executed.push({ sql });
    },
  };
  const ctx: SqliteContext = {
    sqlite3: sqlite3 as unknown as SqliteContext['sqlite3'],
    db: 1,
    vfsName: 'test',
    vfs: {} as SqliteContext['vfs'],
  };
  return { ctx, executed };
};

describe('schema', () => {
  it('applies schema on fresh database', async () => {
    const { ctx, executed } = createContext(0);
    await applySchema(ctx);
    const statements = executed.map((entry) => entry.sql);
    expect(statements[0]).toBe('BEGIN');
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CREATE TABLE IF NOT EXISTS events'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS snapshots'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS projection_cache'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS index_artifacts'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS projection_meta'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS process_manager_state'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS idempotency_keys'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS sync_meta'),
        expect.stringContaining('CREATE TABLE IF NOT EXISTS sync_event_map'),
        'CREATE UNIQUE INDEX IF NOT EXISTS events_aggregate_version ON events (aggregate_type, aggregate_id, version)',
        'CREATE INDEX IF NOT EXISTS sync_event_map_global_seq ON sync_event_map (global_seq)',
        'CREATE INDEX IF NOT EXISTS idempotency_keys_created_at ON idempotency_keys (created_at)',
        'PRAGMA user_version = 1',
        'COMMIT',
      ])
    );
  });

  it('skips schema when already at current version', async () => {
    const { ctx, executed } = createContext(1);
    await applySchema(ctx);
    expect(executed).toHaveLength(0);
  });

  it('throws on unsupported schema versions', async () => {
    const { ctx } = createContext(2);
    await expect(applySchema(ctx)).rejects.toMatchObject({
      code: PlatformErrorCodes.MigrationError,
    });
  });
});
