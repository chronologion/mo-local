import { Kysely, sql } from 'kysely';
import { Database } from '../../database/database.types';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('public_key', 'bytea')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable('invites')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('goal_id', 'uuid', (col) => col.notNull())
    .addColumn('token', 'varchar', (col) => col.notNull().unique())
    .addColumn('permission', 'varchar', (col) => col.notNull())
    .addColumn('wrapped_key', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('expires_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('invites_goal_idx')
    .on('invites')
    .column('goal_id')
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('invites').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
}
