import { Kysely, sql } from 'kysely';
import { Database } from '@platform/infrastructure/database/database.types';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createSchema('auth').ifNotExists().execute();

  await db.schema
    .createTable('auth.users')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('public_key', 'bytea')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable('auth.invites')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('aggregate_id', 'uuid', (col) => col.notNull())
    .addColumn('token', 'varchar', (col) => col.notNull().unique())
    .addColumn('permission', 'varchar', (col) => col.notNull())
    .addColumn('wrapped_key', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('expires_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('auth_invites_aggregate_idx')
    .on('auth.invites')
    .column('aggregate_id')
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('auth.invites').ifExists().execute();
  await db.schema.dropTable('auth.users').ifExists().execute();
  await db.schema.dropSchema('auth').ifExists().execute();
}
