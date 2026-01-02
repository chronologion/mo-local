import { Kysely, sql } from 'kysely';
import { AccessDatabase } from '../../database.types';

export async function up(db: Kysely<AccessDatabase>): Promise<void> {
  await db.schema.createSchema('access').ifNotExists().execute();

  await db.schema
    .createTable('access.identities')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('public_key', 'bytea')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('access.invites')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('aggregate_id', 'uuid', (col) => col.notNull())
    .addColumn('token', 'varchar', (col) => col.notNull().unique())
    .addColumn('permission', 'varchar', (col) => col.notNull())
    .addColumn('wrapped_key', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz')
    .execute();

  await db.schema.createIndex('access_invites_aggregate_idx').on('access.invites').column('aggregate_id').execute();
}

export async function down(db: Kysely<AccessDatabase>): Promise<void> {
  await db.schema.dropTable('access.invites').ifExists().execute();
  await db.schema.dropTable('access.identities').ifExists().execute();
  await db.schema.dropSchema('access').ifExists().execute();
}
