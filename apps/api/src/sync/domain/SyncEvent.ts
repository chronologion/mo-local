import { GlobalSequenceNumber } from './value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from './value-objects/SyncOwnerId';
import { SyncStoreId } from './value-objects/SyncStoreId';

export type SyncEventArgs = unknown;

/**
 * Domain representation of a synced LiveStore event.
 */
export interface SyncEvent {
  ownerId: SyncOwnerId;
  storeId: SyncStoreId;
  seqNum: GlobalSequenceNumber;
  parentSeqNum: GlobalSequenceNumber;
  name: string;
  args: SyncEventArgs;
  clientId: string;
  sessionId: string;
  createdAt: Date;
}
