import { Kysely } from 'kysely';
import { Database } from '../../platform/database/database.types';

/**
 * Legacy placeholder to satisfy existing migration history.
 * New schema lives under per-BC migrations (see auth/0002_auth_schema.ts).
 */
export async function up(_db: Kysely<Database>): Promise<void> {
  // no-op
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // no-op
}
