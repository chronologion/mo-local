import { ColumnType } from 'kysely';

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * ScopeStates table: Signed membership/roles/epoch rotation records
 */
export interface ScopeStatesTable {
  id: ColumnType<number, number | undefined, number>;
  scope_id: string;
  scope_state_seq: string; // bigint as string
  prev_hash: Buffer | null;
  scope_state_ref: Buffer;
  owner_user_id: string;
  scope_epoch: string; // bigint as string
  signed_record_cbor: Buffer;
  members: ColumnType<Record<string, unknown>, string, string>; // JSONB
  signers: ColumnType<Record<string, unknown>, string, string>; // JSONB
  sig_suite: string;
  signature: Buffer;
  created_at: TimestampColumn;
}

/**
 * ScopeStateHeads table: Monotonic append tracking for optimistic locking
 */
export interface ScopeStateHeadsTable {
  scope_id: string;
  owner_user_id: string;
  head_seq: string; // bigint as string
  head_ref: Buffer | null;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

/**
 * ResourceGrants table: Signed catalog/policy + wrapped keys
 */
export interface ResourceGrantsTable {
  id: ColumnType<number, number | undefined, number>;
  grant_id: string;
  scope_id: string;
  resource_id: string;
  grant_seq: string; // bigint as string
  prev_hash: Buffer | null;
  grant_hash: Buffer;
  scope_state_ref: Buffer;
  scope_epoch: string; // bigint as string
  resource_key_id: string;
  wrapped_key: Buffer;
  policy: ColumnType<unknown, string | undefined, string | undefined> | null; // JSONB
  status: string;
  signed_grant_cbor: Buffer;
  sig_suite: string;
  signature: Buffer;
  created_at: TimestampColumn;
}

/**
 * ResourceGrantHeads table: Track active grant per (scopeId, resourceId)
 */
export interface ResourceGrantHeadsTable {
  scope_id: string;
  resource_id: string;
  active_grant_id: string;
  head_seq: string; // bigint as string
  head_hash: Buffer;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

/**
 * KeyEnvelopes table: Per-user scope key distribution
 */
export interface KeyEnvelopesTable {
  id: ColumnType<number, number | undefined, number>;
  envelope_id: string;
  scope_id: string;
  recipient_user_id: string;
  scope_epoch: string; // bigint as string
  recipient_uk_pub_fingerprint: Buffer;
  ciphersuite: string;
  ciphertext: Buffer;
  metadata: ColumnType<unknown, string | undefined, string | undefined> | null; // JSONB
  created_at: TimestampColumn;
}

/**
 * KeyVaultRecords table: Append-only encrypted key log
 */
export interface KeyVaultRecordsTable {
  id: ColumnType<number, number | undefined, number>;
  user_id: string;
  record_seq: string; // bigint as string
  prev_hash: Buffer | null;
  record_hash: Buffer;
  ciphertext: Buffer;
  metadata: ColumnType<unknown, string | undefined, string | undefined> | null; // JSONB
  created_at: TimestampColumn;
}

/**
 * KeyVaultHeads table: Monotonic append tracking per user
 */
export interface KeyVaultHeadsTable {
  user_id: string;
  head_seq: string; // bigint as string
  head_hash: Buffer | null;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

/**
 * Complete database interface for the Sharing bounded context
 */
export interface SharingDatabase {
  'sharing.scope_states': ScopeStatesTable;
  'sharing.scope_state_heads': ScopeStateHeadsTable;
  'sharing.resource_grants': ResourceGrantsTable;
  'sharing.resource_grant_heads': ResourceGrantHeadsTable;
  'sharing.key_envelopes': KeyEnvelopesTable;
  'sharing.keyvault_records': KeyVaultRecordsTable;
  'sharing.keyvault_heads': KeyVaultHeadsTable;
}
