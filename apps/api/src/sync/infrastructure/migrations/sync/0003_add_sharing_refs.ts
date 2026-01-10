import { Kysely } from 'kysely';
import { SyncDatabase } from '../../database.types';

/**
 * Add sharing dependency reference columns to sync.events table.
 * These columns enable validation of scope state and grant dependencies
 * when pushing sync events for encrypted resources.
 */
export async function up(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema
    .alterTable('sync.events')
    .addColumn('scope_id', 'varchar')
    .addColumn('resource_id', 'varchar')
    .addColumn('resource_key_id', 'varchar')
    .addColumn('grant_id', 'varchar')
    .addColumn('scope_state_ref', 'bytea')
    .addColumn('author_device_id', 'varchar')
    .execute();
}

export async function down(db: Kysely<SyncDatabase>): Promise<void> {
  await db.schema
    .alterTable('sync.events')
    .dropColumn('scope_id')
    .dropColumn('resource_id')
    .dropColumn('resource_key_id')
    .dropColumn('grant_id')
    .dropColumn('scope_state_ref')
    .dropColumn('author_device_id')
    .execute();
}
