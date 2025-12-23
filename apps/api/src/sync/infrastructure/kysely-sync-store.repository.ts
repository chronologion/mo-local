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
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    const isLegacyStoreId = (value: string) => value.startsWith('mo-local-v2');
    await db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('sync.stores')
        .select(['store_id', 'owner_identity_id'])
        .where('store_id', '=', storeIdValue)
        .executeTakeFirst();

      if (existing) {
        if (existing.owner_identity_id !== ownerValue) {
          throw new SyncAccessDeniedError(
            `Store ${storeIdValue} is owned by a different identity`
          );
        }
        return;
      }

      const ownedStores = await trx
        .selectFrom('sync.stores')
        .select(['store_id'])
        .where('owner_identity_id', '=', ownerValue)
        .execute();

      if (ownedStores.length === 0) {
        await trx
          .insertInto('sync.stores')
          .values({
            store_id: storeIdValue,
            owner_identity_id: ownerValue,
          })
          .onConflict((oc) => oc.column('store_id').doNothing())
          .execute();
        const inserted = await trx
          .selectFrom('sync.stores')
          .select(['owner_identity_id'])
          .where('store_id', '=', storeIdValue)
          .executeTakeFirst();
        if (inserted && inserted.owner_identity_id !== ownerValue) {
          throw new SyncAccessDeniedError(
            `Store ${storeIdValue} is owned by a different identity`
          );
        }
        return;
      }

      if (ownedStores.length === 1) {
        const priorStoreId = ownedStores[0]?.store_id;
        if (!priorStoreId) return;
        if (priorStoreId === storeIdValue) return;
        const priorIsLegacy = isLegacyStoreId(priorStoreId);
        const nextIsLegacy = isLegacyStoreId(storeIdValue);

        if (!priorIsLegacy) {
          throw new SyncAccessDeniedError(
            `Store ${priorStoreId} is already bound to this identity`
          );
        }

        if (nextIsLegacy) {
          throw new SyncAccessDeniedError(
            `Legacy store mismatch for identity; cannot migrate to ${storeIdValue}`
          );
        }

        const existingEvents = await trx
          .selectFrom('sync.events')
          .select(({ fn }) => fn.countAll<number>().as('count'))
          .where('owner_identity_id', '=', ownerValue)
          .where('store_id', '=', storeIdValue)
          .executeTakeFirst();

        if (Number(existingEvents?.count ?? 0) > 0) {
          throw new SyncAccessDeniedError(
            `Store ${storeIdValue} already has events; cannot migrate`
          );
        }

        await trx
          .updateTable('sync.events')
          .set({ store_id: storeIdValue })
          .where('owner_identity_id', '=', ownerValue)
          .where('store_id', '=', priorStoreId)
          .execute();

        await trx
          .updateTable('sync.stores')
          .set({ store_id: storeIdValue })
          .where('store_id', '=', priorStoreId)
          .execute();
        return;
      }

      throw new SyncAccessDeniedError(
        `Multiple stores exist for identity; cannot auto-migrate to ${storeIdValue}`
      );
    });
  }
}
