import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from './auth.types';

@Injectable()
export class UserProvisioner {
  private readonly logger = new Logger(UserProvisioner.name);

  constructor(private readonly database: DatabaseService) {}

  async ensureExists(user: AuthenticatedUser): Promise<void> {
    await this.database
      .getDb()
      .insertInto('users')
      .values({
        id: user.id,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    this.logger.debug?.(`Ensured user ${user.id} exists`);
  }
}
