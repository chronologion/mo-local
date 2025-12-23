import { Injectable } from '@nestjs/common';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
  SyncRepositoryHeadMismatchError,
} from '../application/ports/sync-event-repository';
import { SyncEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { SyncDatabaseService } from './database.service';

type SyncEventArgs = SyncEvent['args'];

const serializeArgs = (value: SyncEventArgs): string => {
  // Preserve key order for LiveStore equality (JSONB reorders keys).
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Sync event args are not JSON-serializable');
  }
  return serialized;
};

const parseArgs = (value: unknown): SyncEventArgs => {
  if (typeof value !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return value;
  }
};

@Injectable()
export class KyselySyncEventRepository extends SyncEventRepository {
  constructor(private readonly dbService: SyncDatabaseService) {
    super();
  }

  async getHeadSequence(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<GlobalSequenceNumber> {
    const db = this.dbService.getDb();
    const result = await db
      .selectFrom('sync.events')
      .select(({ fn, val }) =>
        fn.coalesce(fn.max<number>('seq_num'), val(0)).as('head')
      )
      .where('owner_identity_id', '=', ownerId.unwrap())
      .where('store_id', '=', storeId.unwrap())
      .executeTakeFirst();

    const headValue = Number(result?.head ?? 0);
    return GlobalSequenceNumber.from(headValue);
  }

  async appendBatch(
    events: SyncEvent[],
    expectedParent: GlobalSequenceNumber
  ): Promise<GlobalSequenceNumber> {
    if (events.length === 0) return expectedParent;
    const db = this.dbService.getDb();
    try {
      return await db.transaction().execute(async (trx) => {
        const first = events[0];
        if (!first) {
          return expectedParent;
        }
        const ownerValue = first.ownerId.unwrap();
        const storeValue = first.storeId.unwrap();
        await trx
          .selectFrom('sync.stores')
          .select('store_id')
          .where('store_id', '=', storeValue)
          .forUpdate()
          .executeTakeFirst();
        const headRow = await trx
          .selectFrom('sync.events')
          .select(({ fn, val }) =>
            fn.coalesce(fn.max<number>('seq_num'), val(0)).as('head')
          )
          .where('owner_identity_id', '=', ownerValue)
          .where('store_id', '=', storeValue)
          .executeTakeFirst();
        const currentHead = Number(headRow?.head ?? 0);
        if (currentHead !== expectedParent.unwrap()) {
          throw new SyncRepositoryHeadMismatchError(
            GlobalSequenceNumber.from(currentHead),
            expectedParent
          );
        }
        await trx
          .insertInto('sync.events')
          .values(
            events.map((event) => ({
              owner_identity_id: event.ownerId.unwrap(),
              store_id: event.storeId.unwrap(),
              seq_num: event.seqNum.unwrap(),
              parent_seq_num: event.parentSeqNum.unwrap(),
              name: event.name,
              args: serializeArgs(event.args),
              client_id: event.clientId,
              session_id: event.sessionId,
              created_at: event.createdAt,
            }))
          )
          .execute();
        const last = events[events.length - 1];
        return GlobalSequenceNumber.from(
          Number(last?.seqNum.unwrap() ?? currentHead)
        );
      });
    } catch (error) {
      // Postgres unique violation
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new SyncRepositoryConflictError(
          'Conflict while appending sync events (duplicate sequence number)',
          error
        );
      }
      if (error instanceof SyncRepositoryHeadMismatchError) {
        throw error;
      }
      throw error;
    }
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
      .select([
        'owner_identity_id',
        'store_id',
        'seq_num',
        'parent_seq_num',
        'name',
        'args',
        'client_id',
        'session_id',
        'created_at',
      ])
      .where('owner_identity_id', '=', ownerId.unwrap())
      .where('store_id', '=', storeId.unwrap())
      .where('seq_num', '>', since.unwrap())
      .orderBy('seq_num', 'asc')
      .limit(limit)
      .execute();

    return rows.map<SyncEvent>((row) => ({
      ownerId,
      storeId,
      seqNum: GlobalSequenceNumber.from(Number(row.seq_num)),
      parentSeqNum: GlobalSequenceNumber.from(Number(row.parent_seq_num)),
      name: row.name,
      args: parseArgs(row.args),
      clientId: row.client_id,
      sessionId: row.session_id,
      createdAt: new Date(row.created_at as Date),
    }));
  }
}
