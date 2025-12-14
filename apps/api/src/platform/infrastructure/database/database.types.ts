import { ColumnType } from 'kysely';

type TimestampColumn = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

export interface IdentitiesTable {
  id: string;
  public_key: Buffer | null;
  created_at: TimestampColumn;
}

export interface InvitesTable {
  id: string;
  aggregate_id: string;
  token: string;
  permission: 'view' | 'edit';
  wrapped_key: Buffer;
  created_at: TimestampColumn;
  expires_at: TimestampColumn | null;
}

export interface Database {
  'auth.identities': IdentitiesTable;
  'auth.invites': InvitesTable;
}
