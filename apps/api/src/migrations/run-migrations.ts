import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { config } from 'dotenv';
import {
  Kysely,
  Migrator,
  PostgresDialect,
  type Migration,
  type MigrationResultSet,
} from 'kysely';
import { Pool } from 'pg';
import { Database } from '../platform/database/database.types';

config();

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://postgres:devpassword@localhost:5434/mo_local';

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString }),
  }),
});

const migrationsRoot = path.join(__dirname, 'definitions');

async function loadMigrations(): Promise<Record<string, Migration>> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  await walk(migrationsRoot);
  files.sort();

  const migrations: Record<string, Migration> = {};
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as {
      up: Migration['up'];
      down: Migration['down'];
    };
    const relative = path.relative(migrationsRoot, file);
    const name = relative.replace(/\\/g, '/').replace(/\.ts$/, '');
    migrations[name] = { up: mod.up, down: mod.down };
  }
  return migrations;
}

const migrator = new Migrator({
  db,
  provider: {
    async getMigrations() {
      return loadMigrations();
    },
  },
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
