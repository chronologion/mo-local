import { Kysely, sql } from 'kysely';
import { SyncDatabase } from '../../database.types';

export async function up(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema.createSchema('sync').ifNotExists().execute();

  await db.schema
    .createTable('sync.events')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('owner_identity_id', 'uuid', (col) => col.notNull())
    .addColumn('store_id', 'varchar', (col) => col.notNull())
    .addColumn('seq_num', 'integer', (col) => col.notNull())
    .addColumn('parent_seq_num', 'integer', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('args', 'jsonb', (col) => col.notNull())
    .addColumn('client_id', 'varchar', (col) => col.notNull())
    .addColumn('session_id', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex('sync_events_stream_seq_idx')
    .on('sync.events')
    .columns(['owner_identity_id', 'store_id', 'seq_num'])
    .unique()
    .execute();
}

export async function down(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema.dropTable('sync.events').ifExists().execute();
  await db.schema.dropSchema('sync').ifExists().execute();
}
