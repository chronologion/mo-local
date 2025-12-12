import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../platform/database/database.service';
import { UserRepository } from '../application/ports/user-repository';

@Injectable()
export class KyselyUserRepository extends UserRepository {
  private readonly logger = new Logger(KyselyUserRepository.name);

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async ensureExists(user: { id: string }): Promise<void> {
    await this.database
      .getDb()
      .insertInto('auth.users')
      .values({
        id: user.id,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    this.logger.debug?.(`Ensured user ${user.id} exists`);
  }
}
