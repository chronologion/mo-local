import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService<DB = unknown> implements OnModuleDestroy {
  private readonly db: Kysely<DB>;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ??
      'postgres://postgres:devpassword@localhost:5434/mo_local';

    if (!connectionString) {
      throw new Error('DATABASE_URL is required to start the API');
    }

    const dialect = new PostgresDialect({
      pool: new Pool({ connectionString }),
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
