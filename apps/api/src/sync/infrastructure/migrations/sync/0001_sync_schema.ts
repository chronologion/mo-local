import { Kysely, sql } from 'kysely';
import { SyncDatabase } from '../../database.types';

export async function up(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema.createSchema('sync').ifNotExists().execute();

  await db.schema
    .createTable('sync.events')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('owner_identity_id', 'uuid', (col) => col.notNull())
    .addColumn('store_id', 'varchar', (col) => col.notNull())
    .addColumn('global_seq', 'integer', (col) => col.notNull())
    .addColumn('event_id', 'varchar', (col) => col.notNull())
    .addColumn('record_json', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('sync_events_stream_seq_idx')
    .on('sync.events')
    .columns(['owner_identity_id', 'store_id', 'global_seq'])
    .unique()
    .execute();

  await db.schema
    .createIndex('sync_events_stream_event_id_idx')
    .on('sync.events')
    .columns(['owner_identity_id', 'store_id', 'event_id'])
    .unique()
    .execute();
}

export async function down(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema.dropTable('sync.events').ifExists().execute();
  await db.schema.dropSchema('sync').ifExists().execute();
}
