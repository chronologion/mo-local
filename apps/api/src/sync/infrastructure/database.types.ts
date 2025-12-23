import { ColumnType } from 'kysely';

type TimestampColumn = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

export interface SyncEventsTable {
  id: ColumnType<number, number | undefined, number>;
  owner_identity_id: string;
  store_id: string;
  seq_num: number;
  parent_seq_num: number;
  name: string;
  args: string;
  client_id: string;
  session_id: string;
  created_at: TimestampColumn;
}

export interface SyncDatabase {
  'sync.events': SyncEventsTable;
  'sync.stores': SyncStoreTable;
}

export interface SyncStoreTable {
  store_id: string;
  owner_identity_id: string;
  created_at: TimestampColumn;
}
