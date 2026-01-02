import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService<DB = unknown> implements OnModuleDestroy {
  private readonly db: Kysely<DB>;

  constructor() {
    const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:devpassword@localhost:5434/mo_local';

    if (!connectionString) {
      throw new Error('DATABASE_URL is required to start the API');
    }

    const dialect = new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: envInt('DB_POOL_MAX', 10),
        idleTimeoutMillis: envInt('DB_POOL_IDLE_MS', 30000),
        connectionTimeoutMillis: envInt('DB_POOL_CONNECT_TIMEOUT_MS', 5000),
      }),
    });

    this.db = new Kysely<DB>({ dialect });
  }

  getDb(): Kysely<DB> {
    return this.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
