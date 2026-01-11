import { Kysely, sql } from 'kysely';
import { SharingDatabase } from '../../database.types';

export async function up(db: Kysely<SharingDatabase>): Promise<void> {
  // KeyVault Records: Append-only encrypted key log for recovery/multi-device sync
  await db.schema
    .createTable('sharing.keyvault_records')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('record_seq', 'bigint', (col) => col.notNull())
    .addColumn('prev_hash', 'bytea')
    .addColumn('record_hash', 'bytea', (col) => col.notNull())
    .addColumn('ciphertext', 'bytea', (col) => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('keyvault_records_unique_seq_idx')
    .on('sharing.keyvault_records')
    .columns(['user_id', 'record_seq'])
    .unique()
    .execute();

  await db.schema
    .createIndex('keyvault_records_user_seq_idx')
    .on('sharing.keyvault_records')
    .columns(['user_id', 'record_seq'])
    .execute();

  // KeyVault Heads: Monotonic append tracking per user
  await db.schema
    .createTable('sharing.keyvault_heads')
    .addColumn('user_id', 'uuid', (col) => col.primaryKey())
    .addColumn('head_seq', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('head_hash', 'bytea')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<SharingDatabase>): Promise<void> {
  await db.schema.dropTable('sharing.keyvault_heads').ifExists().execute();
  await db.schema.dropTable('sharing.keyvault_records').ifExists().execute();
}
