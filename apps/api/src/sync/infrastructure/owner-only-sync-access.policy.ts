import { Injectable } from '@nestjs/common';
import { SyncAccessPolicy, SyncAccessDeniedError } from '../application/ports/sync-access-policy';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';

/**
 * Default access policy: only the authenticated owner may push/pull.
 * This is a temporary implementation until sharing permissions exist.
 */
@Injectable()
export class OwnerOnlySyncAccessPolicy extends SyncAccessPolicy {
  async ensureCanPush(actorId: SyncOwnerId, _storeId: SyncStoreId): Promise<void> {
    if (!actorId.unwrap()) {
      throw new SyncAccessDeniedError('Invalid actor');
    }
  }

  async ensureCanPull(actorId: SyncOwnerId, _storeId: SyncStoreId): Promise<void> {
    if (!actorId.unwrap()) {
      throw new SyncAccessDeniedError('Invalid actor');
    }
  }
}
