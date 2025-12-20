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

  async ensureStoreOwner(
    storeId: SyncStoreId,
    ownerId: SyncOwnerId
  ): Promise<void> {
    const db = this.dbService.getDb();
    // Idempotent insert: avoid races when multiple tabs claim the same store.
    await db
      .insertInto('sync.stores')
      .values({
        store_id: storeId.unwrap(),
        owner_identity_id: ownerId.unwrap(),
      })
      .onConflict((oc) => oc.column('store_id').doNothing())
      .execute();

    const existing = await db
      .selectFrom('sync.stores')
      .select(['store_id', 'owner_identity_id'])
      .where('store_id', '=', storeId.unwrap())
      .executeTakeFirst();

    if (existing && existing.owner_identity_id !== ownerId.unwrap()) {
      throw new SyncAccessDeniedError(
        `Store ${storeId.unwrap()} is owned by a different identity`
      );
    }
  }
}
