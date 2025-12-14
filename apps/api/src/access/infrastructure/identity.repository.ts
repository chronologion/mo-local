import { Injectable, Logger } from '@nestjs/common';
import { IdentityRepository } from '../application/ports/identity-repository';
import { AccessDatabaseService } from './database.service';

@Injectable()
export class KyselyIdentityRepository extends IdentityRepository {
  private readonly logger = new Logger(KyselyIdentityRepository.name);

  constructor(private readonly database: AccessDatabaseService) {
    super();
  }

  async ensureExists(identity: { id: string }): Promise<void> {
    await this.database
      .getDb()
      .insertInto('access.identities')
      .values({
        id: identity.id,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    this.logger.debug?.(`Ensured identity ${identity.id} exists`);
  }
}
