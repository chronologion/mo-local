import { promises as fs } from 'fs';
import path from 'path';
import { config } from 'dotenv';
import {
  Kysely,
  Migrator,
  FileMigrationProvider,
  PostgresDialect,
  type MigrationResultSet,
} from 'kysely';
import { Pool } from 'pg';
import { Database } from '../database/database.types';

config();

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://postgres:devpassword@localhost:5434/mo_local';

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString }),
  }),
});

const migrationsFolder = path.join(__dirname, 'definitions');

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: migrationsFolder,
  }),
});

async function run(): Promise<void> {
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
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
