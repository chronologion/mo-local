import { SyncOwnerId } from '../../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../domain/value-objects/SyncStoreId';

export class SyncAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncAccessDeniedError';
  }
}

export abstract class SyncAccessPolicy {
  abstract ensureCanPush(
    actorId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<void>;

  abstract ensureCanPull(
    actorId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<void>;
}
