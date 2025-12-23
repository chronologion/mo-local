import { describe, expect, it } from 'vitest';
import {
  resetEventlogSyncStatus,
  type SqliteDbLike,
} from '../../src/utils/resetSyncHeadEventlog';

const makeDb = (options: {
  hasSyncStatusTable: boolean;
  hasBackendIdColumn: boolean;
}) => {
  const executed: string[] = [];

  const db: SqliteDbLike = {
    select: <T>(queryStr: string): ReadonlyArray<T> => {
      if (queryStr.includes("name='__livestore_sync_status'")) {
        return (options.hasSyncStatusTable
          ? [{ name: '__livestore_sync_status' }]
          : []) as unknown as ReadonlyArray<T>;
      }

      if (queryStr.includes("pragma_table_info('__livestore_sync_status')")) {
        const cols = options.hasBackendIdColumn
          ? [{ name: 'head' }, { name: 'backendId' }]
          : [{ name: 'head' }];
        return cols as unknown as ReadonlyArray<T>;
      }

      return [] as unknown as ReadonlyArray<T>;
    },
    execute: (queryStr: string) => {
      executed.push(queryStr);
    },
  };

  return { db, executed };
};

describe('resetEventlogSyncStatus', () => {
  it('throws when __livestore_sync_status is missing', () => {
    const { db } = makeDb({
      hasSyncStatusTable: false,
      hasBackendIdColumn: false,
    });
    expect(() => resetEventlogSyncStatus(db)).toThrow(
      /__livestore_sync_status/
    );
  });

  it('resets head and clears backendId when column exists', () => {
    const { db, executed } = makeDb({
      hasSyncStatusTable: true,
      hasBackendIdColumn: true,
    });
    resetEventlogSyncStatus(db);
    expect(executed).toEqual([
      'UPDATE __livestore_sync_status SET head = 0, backendId = NULL',
    ]);
  });

  it('resets head when backendId column is absent', () => {
    const { db, executed } = makeDb({
      hasSyncStatusTable: true,
      hasBackendIdColumn: false,
    });
    resetEventlogSyncStatus(db);
    expect(executed).toEqual(['UPDATE __livestore_sync_status SET head = 0']);
  });
});
