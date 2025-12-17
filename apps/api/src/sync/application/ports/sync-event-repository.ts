import { SyncEvent } from '../../domain/SyncEvent';
import { GlobalSequenceNumber } from '../../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../domain/value-objects/SyncStoreId';

export class SyncRepositoryConflictError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SyncRepositoryConflictError';
  }
}

export abstract class SyncEventRepository {
  abstract getHeadSequence(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<GlobalSequenceNumber>;

  abstract appendBatch(events: SyncEvent[]): Promise<void>;

  abstract loadSince(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId,
    since: GlobalSequenceNumber,
    limit: number
  ): Promise<SyncEvent[]>;
}
