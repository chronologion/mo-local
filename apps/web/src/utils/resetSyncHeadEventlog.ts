export type SqliteDbLike = {
  select<T>(queryStr: string): ReadonlyArray<T>;
  execute(queryStr: string): void;
};

export const resetEventlogSyncStatus = (db: SqliteDbLike): void => {
  const tableExists = db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='__livestore_sync_status'"
  );
  if (tableExists.length === 0) {
    throw new Error(
      'eventlog.db does not contain __livestore_sync_status (are you pointing at the state DB instead?)'
    );
  }

  const columns = db.select<{ name: string }>(
    "SELECT name FROM pragma_table_info('__livestore_sync_status')"
  );
  const hasBackendId = columns.some((col) => col.name === 'backendId');

  if (hasBackendId) {
    db.execute('UPDATE __livestore_sync_status SET head = 0, backendId = NULL');
    return;
  }

  db.execute('UPDATE __livestore_sync_status SET head = 0');
};
