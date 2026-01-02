import { SyncOwnerId } from '../../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../domain/value-objects/SyncStoreId';
import { SyncAccessDeniedError } from './sync-access-policy';

export abstract class SyncStoreRepository {
  abstract ensureStoreOwner(storeId: SyncStoreId, ownerId: SyncOwnerId): Promise<void>;
}

export class SyncStoreOwnershipError extends SyncAccessDeniedError {
  constructor(message: string) {
    super(message);
    this.name = 'SyncStoreOwnershipError';
  }
}
