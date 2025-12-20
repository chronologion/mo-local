import { Kysely, sql } from 'kysely';
import { SyncDatabase } from '../../database.types';

export async function up(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema
    .createTable('sync.stores')
    .addColumn('store_id', 'varchar', (col) => col.primaryKey())
    .addColumn('owner_identity_id', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();
}

export async function down(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema.dropTable('sync.stores').ifExists().execute();
}
