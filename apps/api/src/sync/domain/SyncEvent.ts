import { GlobalSequenceNumber } from './value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from './value-objects/SyncOwnerId';
import { SyncStoreId } from './value-objects/SyncStoreId';

/**
 * Domain representation of a synced event record (canonical JSON text).
 */
export interface SyncEvent {
  ownerId: SyncOwnerId;
  storeId: SyncStoreId;
  globalSequence: GlobalSequenceNumber;
  eventId: string;
  recordJson: string;
  createdAt: Date;
}

export type SyncEventAssignment = Readonly<{
  eventId: string;
  globalSequence: GlobalSequenceNumber;
}>;

export type SyncIncomingEvent = Readonly<{
  eventId: string;
  recordJson: string;
  // Optional sharing dependency references (for encrypted resources)
  scopeId?: string;
  resourceId?: string;
  resourceKeyId?: string;
  grantId?: string;
  scopeStateRef?: Buffer;
  authorDeviceId?: string;
}>;
