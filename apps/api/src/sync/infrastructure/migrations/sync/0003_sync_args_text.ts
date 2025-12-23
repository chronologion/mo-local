import { Kysely, sql } from 'kysely';
import { SyncDatabase } from '../../database.types';

export async function up(db: Kysely<SyncDatabase>): Promise<void> {
  await sql`
    ALTER TABLE sync.events
    ALTER COLUMN args TYPE text
    USING args::text
  `.execute(db);
}

export async function down(db: Kysely<SyncDatabase>): Promise<void> {
  await sql`
    ALTER TABLE sync.events
    ALTER COLUMN args TYPE jsonb
    USING args::jsonb
  `.execute(db);
}
