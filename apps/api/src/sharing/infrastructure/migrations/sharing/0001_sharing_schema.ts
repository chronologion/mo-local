import { Kysely, sql } from 'kysely';
import { SharingDatabase } from '../../database.types';

export async function up(db: Kysely<SharingDatabase>): Promise<void> {
  // Create sharing schema
  await db.schema.createSchema('sharing').ifNotExists().execute();

  // ScopeState: Signed membership/roles/epoch rotation records
  await db.schema
    .createTable('sharing.scope_states')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('scope_id', 'varchar', (col) => col.notNull())
    .addColumn('scope_state_seq', 'bigint', (col) => col.notNull())
    .addColumn('prev_hash', 'bytea')
    .addColumn('scope_state_ref', 'bytea', (col) => col.notNull())
    .addColumn('owner_user_id', 'uuid', (col) => col.notNull())
    .addColumn('scope_epoch', 'bigint', (col) => col.notNull())
    .addColumn('signed_record_cbor', 'bytea', (col) => col.notNull())
    .addColumn('members', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('signers', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('sig_suite', 'varchar', (col) => col.notNull())
    .addColumn('signature', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('scope_states_unique_seq_idx')
    .on('sharing.scope_states')
    .columns(['scope_id', 'scope_state_seq'])
    .unique()
    .execute();

  await db.schema.createIndex('scope_states_owner_idx').on('sharing.scope_states').column('owner_user_id').execute();

  await db.schema.createIndex('scope_states_ref_idx').on('sharing.scope_states').column('scope_state_ref').execute();

  // ScopeStateHeads: Monotonic append tracking for optimistic locking
  await db.schema
    .createTable('sharing.scope_state_heads')
    .addColumn('scope_id', 'varchar', (col) => col.primaryKey())
    .addColumn('owner_user_id', 'uuid', (col) => col.notNull())
    .addColumn('head_seq', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('head_ref', 'bytea')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('scope_state_heads_owner_idx')
    .on('sharing.scope_state_heads')
    .column('owner_user_id')
    .execute();

  // ResourceGrants: Signed catalog/policy + wrapped keys
  await db.schema
    .createTable('sharing.resource_grants')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('grant_id', 'varchar', (col) => col.notNull().unique())
    .addColumn('scope_id', 'varchar', (col) => col.notNull())
    .addColumn('resource_id', 'varchar', (col) => col.notNull())
    .addColumn('grant_seq', 'bigint', (col) => col.notNull())
    .addColumn('prev_hash', 'bytea')
    .addColumn('grant_hash', 'bytea', (col) => col.notNull())
    .addColumn('scope_state_ref', 'bytea', (col) => col.notNull())
    .addColumn('scope_epoch', 'bigint', (col) => col.notNull())
    .addColumn('resource_key_id', 'varchar', (col) => col.notNull())
    .addColumn('wrapped_key', 'bytea', (col) => col.notNull())
    .addColumn('policy', 'jsonb')
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('active'))
    .addColumn('signed_grant_cbor', 'bytea', (col) => col.notNull())
    .addColumn('sig_suite', 'varchar', (col) => col.notNull())
    .addColumn('signature', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('resource_grants_unique_seq_idx')
    .on('sharing.resource_grants')
    .columns(['scope_id', 'grant_seq'])
    .unique()
    .execute();

  await db.schema
    .createIndex('resource_grants_resource_idx')
    .on('sharing.resource_grants')
    .column('resource_id')
    .execute();

  await db.schema
    .createIndex('resource_grants_scope_resource_idx')
    .on('sharing.resource_grants')
    .columns(['scope_id', 'resource_id', 'status'])
    .execute();

  await db.schema
    .createIndex('resource_grants_grant_hash_idx')
    .on('sharing.resource_grants')
    .column('grant_hash')
    .execute();

  // ResourceGrantHeads: Track active grant per (scopeId, resourceId)
  await db.schema
    .createTable('sharing.resource_grant_heads')
    .addColumn('scope_id', 'varchar', (col) => col.notNull())
    .addColumn('resource_id', 'varchar', (col) => col.notNull())
    .addColumn('active_grant_id', 'varchar', (col) => col.notNull())
    .addColumn('head_seq', 'bigint', (col) => col.notNull())
    .addColumn('head_hash', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('resource_grant_heads_pk')
    .on('sharing.resource_grant_heads')
    .columns(['scope_id', 'resource_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('resource_grant_heads_scope_idx')
    .on('sharing.resource_grant_heads')
    .column('scope_id')
    .execute();

  // KeyEnvelopes: Per-user scope key distribution
  await db.schema
    .createTable('sharing.key_envelopes')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('envelope_id', 'varchar', (col) => col.notNull().unique())
    .addColumn('scope_id', 'varchar', (col) => col.notNull())
    .addColumn('recipient_user_id', 'uuid', (col) => col.notNull())
    .addColumn('scope_epoch', 'bigint', (col) => col.notNull())
    .addColumn('recipient_uk_pub_fingerprint', 'bytea', (col) => col.notNull())
    .addColumn('ciphersuite', 'varchar', (col) => col.notNull())
    .addColumn('ciphertext', 'bytea', (col) => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('key_envelopes_unique_recipient_epoch_idx')
    .on('sharing.key_envelopes')
    .columns(['scope_id', 'recipient_user_id', 'scope_epoch'])
    .unique()
    .execute();

  await db.schema.createIndex('key_envelopes_scope_idx').on('sharing.key_envelopes').column('scope_id').execute();

  await db.schema
    .createIndex('key_envelopes_recipient_idx')
    .on('sharing.key_envelopes')
    .column('recipient_user_id')
    .execute();

  await db.schema
    .createIndex('key_envelopes_scope_recipient_idx')
    .on('sharing.key_envelopes')
    .columns(['scope_id', 'recipient_user_id'])
    .execute();
}

export async function down(db: Kysely<SharingDatabase>): Promise<void> {
  await db.schema.dropTable('sharing.key_envelopes').ifExists().execute();
  await db.schema.dropTable('sharing.resource_grant_heads').ifExists().execute();
  await db.schema.dropTable('sharing.resource_grants').ifExists().execute();
  await db.schema.dropTable('sharing.scope_state_heads').ifExists().execute();
  await db.schema.dropTable('sharing.scope_states').ifExists().execute();
  await db.schema.dropSchema('sharing').ifExists().execute();
}
