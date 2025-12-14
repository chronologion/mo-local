import { promises as fs } from 'fs';
import path from 'path';
import {
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
  type MigrationResultSet,
} from 'kysely';
import { Pool } from 'pg';

type MigratorConfig = {
  migrationsPath: string;
  connectionString: string;
  migrationTableName?: string;
};

export async function runMigrations<DB>({
  migrationsPath,
  connectionString,
  migrationTableName,
}: MigratorConfig): Promise<void> {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });

  // Allow nested folders inside a BC migrations path.
  const provider = new FileMigrationProvider({
    fs,
    path,
    migrationFolder: migrationsPath,
  });

  const migrator = new Migrator({
    db,
    provider,
    migrationTableName,
  });

  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const migrationResult: MigrationResultSet =
    direction === 'down'
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();

  migrationResult.results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`Migration ${result.migrationName} ${direction} succeeded`);
    } else if (result.status === 'Error') {
      console.error(`Migration ${result.migrationName} failed`);
    }
  });

  if (migrationResult.error) {
    console.error('Migration failed', migrationResult.error);
    process.exit(1);
  }

  await db.destroy();
}

export function resolveConnectionString(
  envVar: string,
  fallback?: string
): string {
  const value = process.env[envVar] ?? fallback;
  if (!value) {
    throw new Error(`Missing connection string for migrations (${envVar})`);
  }
  return value;
}
