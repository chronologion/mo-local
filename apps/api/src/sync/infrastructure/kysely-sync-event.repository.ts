import { Injectable } from '@nestjs/common';
import {
  SyncAppendResult,
  SyncEventRepository,
  SyncRepositoryHeadMismatchError,
} from '../application/ports/sync-event-repository';
import { SyncEvent, SyncEventAssignment, SyncIncomingEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { SyncDatabaseService } from './database.service';

@Injectable()
export class KyselySyncEventRepository extends SyncEventRepository {
  constructor(private readonly dbService: SyncDatabaseService) {
    super();
  }

  async getHeadSequence(ownerId: SyncOwnerId, storeId: SyncStoreId): Promise<GlobalSequenceNumber> {
    const db = this.dbService.getDb();
    const result = await db
      .selectFrom('sync.stores')
      .select('head')
      .where('store_id', '=', storeId.unwrap())
      .where('owner_identity_id', '=', ownerId.unwrap())
      .executeTakeFirst();
    const headValue = Number(result?.head ?? 0);
    return GlobalSequenceNumber.from(headValue);
  }

  async appendBatch(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    expectedHead: GlobalSequenceNumber;
    events: ReadonlyArray<SyncIncomingEvent>;
  }): Promise<SyncAppendResult> {
    const { ownerId, storeId, expectedHead, events } = params;
    if (events.length === 0) {
      return { head: expectedHead, assigned: [] };
    }
    const db = this.dbService.getDb();
    return await db.transaction().execute(async (trx) => {
      const ownerValue = ownerId.unwrap();
      const storeValue = storeId.unwrap();
      const storeRow = await trx
        .selectFrom('sync.stores')
        .select(['store_id', 'head'])
        .where('store_id', '=', storeValue)
        .where('owner_identity_id', '=', ownerValue)
        .forUpdate()
        .executeTakeFirst();
      if (!storeRow) {
        throw new Error(`Sync store ${storeValue} not found`);
      }
      let currentHead = Number(storeRow.head ?? 0);
      if (currentHead !== expectedHead.unwrap()) {
        throw new SyncRepositoryHeadMismatchError(GlobalSequenceNumber.from(currentHead), expectedHead);
      }

      const existingRows = await trx
        .selectFrom('sync.events')
        .select(['event_id', 'global_seq'])
        .where('owner_identity_id', '=', ownerValue)
        .where('store_id', '=', storeValue)
        .where(
          'event_id',
          'in',
          events.map((event) => event.eventId)
        )
        .execute();

      const existing = new Map(existingRows.map((row) => [row.event_id, Number(row.global_seq)]));

      const assigned: SyncEventAssignment[] = [];

      for (const event of events) {
        const known = existing.get(event.eventId);
        if (known !== undefined) {
          assigned.push({
            eventId: event.eventId,
            globalSequence: GlobalSequenceNumber.from(known),
          });
          continue;
        }
        const nextSequence = currentHead + 1;
        const inserted = await trx
          .insertInto('sync.events')
          .values({
            owner_identity_id: ownerValue,
            store_id: storeValue,
            global_seq: nextSequence,
            event_id: event.eventId,
            record_json: event.recordJson,
          })
          .onConflict((oc) => oc.columns(['owner_identity_id', 'store_id', 'event_id']).doNothing())
          .returning(['event_id', 'global_seq'])
          .executeTakeFirst();

        if (inserted) {
          currentHead = nextSequence;
          assigned.push({
            eventId: inserted.event_id,
            globalSequence: GlobalSequenceNumber.from(Number(inserted.global_seq)),
          });
          continue;
        }

        const row = await trx
          .selectFrom('sync.events')
          .select(['event_id', 'global_seq'])
          .where('owner_identity_id', '=', ownerValue)
          .where('store_id', '=', storeValue)
          .where('event_id', '=', event.eventId)
          .executeTakeFirst();

        if (!row) {
          throw new Error(`Failed to insert or resolve event ${event.eventId}`);
        }

        assigned.push({
          eventId: row.event_id,
          globalSequence: GlobalSequenceNumber.from(Number(row.global_seq)),
        });
      }

      await trx.updateTable('sync.stores').set({ head: currentHead }).where('store_id', '=', storeValue).execute();

      return {
        head: GlobalSequenceNumber.from(currentHead),
        assigned,
      };
    });
  }

  async loadSince(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId,
    since: GlobalSequenceNumber,
    limit: number
  ): Promise<SyncEvent[]> {
    const db = this.dbService.getDb();
    const rows = await db
      .selectFrom('sync.events')
      .select(['owner_identity_id', 'store_id', 'global_seq', 'event_id', 'record_json', 'created_at'])
      .where('owner_identity_id', '=', ownerId.unwrap())
      .where('store_id', '=', storeId.unwrap())
      .where('global_seq', '>', since.unwrap())
      .orderBy('global_seq', 'asc')
      .limit(limit)
      .execute();

    return rows.map<SyncEvent>((row) => ({
      ownerId,
      storeId,
      globalSequence: GlobalSequenceNumber.from(Number(row.global_seq)),
      eventId: row.event_id,
      recordJson: row.record_json,
      createdAt: new Date(row.created_at as Date),
    }));
  }

  async resetStore(ownerId: SyncOwnerId, storeId: SyncStoreId): Promise<void> {
    const db = this.dbService.getDb();
    await db.transaction().execute(async (trx) => {
      const ownerValue = ownerId.unwrap();
      const storeValue = storeId.unwrap();
      await trx
        .deleteFrom('sync.events')
        .where('owner_identity_id', '=', ownerValue)
        .where('store_id', '=', storeValue)
        .execute();
      await trx
        .updateTable('sync.stores')
        .set({ head: 0 })
        .where('owner_identity_id', '=', ownerValue)
        .where('store_id', '=', storeValue)
        .execute();
    });
  }
}
