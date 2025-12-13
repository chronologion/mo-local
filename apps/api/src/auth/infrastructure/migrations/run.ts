import path from 'path';
import { config } from 'dotenv';
import {
  resolveConnectionString,
  runMigrations,
} from '@platform/infrastructure/migrations/migrator';

config();

async function main(): Promise<void> {
  const connectionString = resolveConnectionString(
    'AUTH_DATABASE_URL',
    process.env.DATABASE_URL ??
      'postgres://postgres:devpassword@localhost:5434/mo_local'
  );

  const migrationsPath = path.join(__dirname, 'auth');

  await runMigrations({
    migrationsPath,
    connectionString,
    migrationTableName: 'auth_migrations',
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
