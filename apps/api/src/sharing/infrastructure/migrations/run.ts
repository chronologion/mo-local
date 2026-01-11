import path from 'path';
import { config } from 'dotenv';
import { resolveConnectionString, runMigrations } from '@platform/infrastructure/migrations/migrator';
import { SharingDatabase } from '../database.types';

config();

async function main(): Promise<void> {
  const connectionString = resolveConnectionString(
    'SHARING_DATABASE_URL',
    process.env.DATABASE_URL ?? 'postgres://postgres:devpassword@localhost:5434/mo_local'
  );

  const migrationsPath = path.join(__dirname, 'sharing');

  await runMigrations<SharingDatabase>({
    migrationsPath,
    connectionString,
    migrationTableName: 'sharing_migrations',
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
