import { ColumnType } from 'kysely';

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

export interface SyncEventsTable {
  id: ColumnType<number, number | undefined, number>;
  owner_identity_id: string;
  store_id: string;
  global_seq: number;
  event_id: string;
  record_json: string;
  created_at: TimestampColumn;
  // Sharing dependency references (nullable)
  scope_id: string | null;
  resource_id: string | null;
  resource_key_id: string | null;
  grant_id: string | null;
  scope_state_ref: Buffer | null;
  author_device_id: string | null;
}

export interface SyncDatabase {
  'sync.events': SyncEventsTable;
  'sync.stores': SyncStoreTable;
}

export interface SyncStoreTable {
  store_id: string;
  owner_identity_id: string;
  head: number;
  created_at: TimestampColumn;
}
