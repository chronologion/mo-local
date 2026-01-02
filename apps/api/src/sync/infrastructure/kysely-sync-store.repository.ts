import { Injectable } from '@nestjs/common';
import { SyncStoreRepository } from '../application/ports/sync-store-repository';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { SyncDatabaseService } from './database.service';
import { SyncAccessDeniedError } from '../application/ports/sync-access-policy';

@Injectable()
export class KyselySyncStoreRepository extends SyncStoreRepository {
  constructor(private readonly dbService: SyncDatabaseService) {
    super();
  }

  async ensureStoreOwner(storeId: SyncStoreId, ownerId: SyncOwnerId): Promise<void> {
    const db = this.dbService.getDb();
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('sync.stores')
        .values({
          store_id: storeIdValue,
          owner_identity_id: ownerValue,
          head: 0,
        })
        .onConflict((oc) => oc.column('store_id').doNothing())
        .execute();

      const existing = await trx
        .selectFrom('sync.stores')
        .select(['owner_identity_id'])
        .where('store_id', '=', storeIdValue)
        .executeTakeFirst();

      if (!existing) {
        throw new Error(`Failed to ensure store ${storeIdValue} exists`);
      }

      if (existing.owner_identity_id !== ownerValue) {
        throw new SyncAccessDeniedError(`Store ${storeIdValue} is owned by a different identity`);
      }
    });
  }
}
