import {
  SyncEvent,
  SyncEventAssignment,
  SyncIncomingEvent,
} from '../../domain/SyncEvent';
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

export class SyncRepositoryHeadMismatchError extends Error {
  constructor(
    readonly currentHead: GlobalSequenceNumber,
    readonly expectedHead: GlobalSequenceNumber
  ) {
    super('Sync backend head mismatch');
    this.name = 'SyncRepositoryHeadMismatchError';
  }
}

export type SyncAppendResult = Readonly<{
  head: GlobalSequenceNumber;
  assigned: ReadonlyArray<SyncEventAssignment>;
}>;

export abstract class SyncEventRepository {
  abstract getHeadSequence(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<GlobalSequenceNumber>;

  abstract appendBatch(
    params: Readonly<{
      ownerId: SyncOwnerId;
      storeId: SyncStoreId;
      expectedHead: GlobalSequenceNumber;
      events: ReadonlyArray<SyncIncomingEvent>;
    }>
  ): Promise<SyncAppendResult>;

  abstract loadSince(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId,
    since: GlobalSequenceNumber,
    limit: number
  ): Promise<SyncEvent[]>;
}
