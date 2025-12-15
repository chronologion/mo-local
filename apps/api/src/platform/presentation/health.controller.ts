import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '@platform/infrastructure/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: boolean }> {
    await sql`select 1`.execute(this.database.getDb());
    return { status: 'ok', db: true };
  }
}
