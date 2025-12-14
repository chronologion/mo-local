import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@platform/infrastructure/database/database.service';
import { IdentityRepository } from '../application/ports/user-repository';

@Injectable()
export class KyselyIdentityRepository extends IdentityRepository {
  private readonly logger = new Logger(KyselyIdentityRepository.name);

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async ensureExists(user: { id: string }): Promise<void> {
    await this.database
      .getDb()
      .insertInto('auth.identities')
      .values({
        id: user.id,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    this.logger.debug?.(`Ensured user ${user.id} exists`);
  }
}
