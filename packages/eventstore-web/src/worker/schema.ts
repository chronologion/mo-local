import type { SqliteContext } from './sqlite';
import { PlatformErrorCodes } from '@mo/eventstore-core';

const SCHEMA_VERSION = 1;

const SCHEMA_V1: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS events (
    commit_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_encrypted BLOB NOT NULL,
    keyring_update BLOB NULL,
    version INTEGER NOT NULL,
    occurred_at INTEGER NOT NULL,
    actor_id TEXT NULL,
    causation_id TEXT NULL,
    correlation_id TEXT NULL,
    epoch INTEGER NULL
  )`,
  'CREATE INDEX IF NOT EXISTS events_aggregate_version ON events (aggregate_type, aggregate_id, version)',
  'CREATE INDEX IF NOT EXISTS events_aggregate_commit_sequence ON events (aggregate_type, commit_sequence)',
  `CREATE TABLE IF NOT EXISTS snapshots (
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    snapshot_version INTEGER NOT NULL,
    snapshot_encrypted BLOB NOT NULL,
    last_global_seq INTEGER NOT NULL,
    last_pending_commit_seq INTEGER NOT NULL,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (aggregate_type, aggregate_id)
  )`,
  `CREATE TABLE IF NOT EXISTS projection_cache (
    projection_id TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    cache_version INTEGER NOT NULL,
    cache_encrypted BLOB NOT NULL,
    ordering TEXT NOT NULL,
    last_global_seq INTEGER NOT NULL,
    last_pending_commit_seq INTEGER NOT NULL,
    last_commit_sequence INTEGER NOT NULL,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (projection_id, scope_key)
  )`,
  `CREATE TABLE IF NOT EXISTS index_artifacts (
    index_id TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    artifact_version INTEGER NOT NULL,
    artifact_encrypted BLOB NOT NULL,
    last_global_seq INTEGER NOT NULL,
    last_pending_commit_seq INTEGER NOT NULL,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (index_id, scope_key)
  )`,
  `CREATE TABLE IF NOT EXISTS projection_meta (
    projection_id TEXT PRIMARY KEY,
    ordering TEXT NOT NULL,
    last_global_seq INTEGER NOT NULL,
    last_pending_commit_seq INTEGER NOT NULL,
    last_commit_sequence INTEGER NOT NULL,
    phase TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS process_manager_state (
    process_manager_id TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    state_version INTEGER NOT NULL,
    state_encrypted BLOB NOT NULL,
    last_global_seq INTEGER NOT NULL,
    last_pending_commit_seq INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (process_manager_id, scope_key)
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    store_id TEXT PRIMARY KEY,
    last_pulled_global_seq INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_event_map (
    event_id TEXT PRIMARY KEY,
    global_seq INTEGER NOT NULL UNIQUE,
    inserted_at INTEGER NOT NULL
  )`,
];

export async function applySchema(ctx: SqliteContext): Promise<void> {
  const currentVersion = await readUserVersion(ctx);
  if (currentVersion === SCHEMA_VERSION) return;
  if (currentVersion !== 0) {
    const error = new Error(
      `Unsupported schema version ${currentVersion}, expected ${SCHEMA_VERSION}`
    ) as Error & { code?: string };
    error.code = PlatformErrorCodes.MigrationError;
    throw error;
  }

  await ctx.sqlite3.exec(ctx.db, 'BEGIN');
  try {
    for (const statement of SCHEMA_V1) {
      await ctx.sqlite3.exec(ctx.db, statement);
    }
    await ctx.sqlite3.exec(ctx.db, `PRAGMA user_version = ${SCHEMA_VERSION}`);
    await ctx.sqlite3.exec(ctx.db, 'COMMIT');
  } catch (error) {
    try {
      await ctx.sqlite3.exec(ctx.db, 'ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

async function readUserVersion(ctx: SqliteContext): Promise<number> {
  let version = 0;
  await ctx.sqlite3.exec(ctx.db, 'PRAGMA user_version', (row) => {
    const value = row[0];
    const asNumber =
      typeof value === 'number'
        ? value
        : typeof value === 'bigint'
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(asNumber)) {
      version = Math.trunc(asNumber);
    }
  });
  return version;
}
