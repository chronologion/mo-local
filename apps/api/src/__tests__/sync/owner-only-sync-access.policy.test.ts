import { describe, expect, it } from 'vitest';
import { OwnerOnlySyncAccessPolicy } from '../../sync/infrastructure/owner-only-sync-access.policy';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';

describe('OwnerOnlySyncAccessPolicy', () => {
  it('allows push and pull for valid actors', async () => {
    const policy = new OwnerOnlySyncAccessPolicy();
    const actor = SyncOwnerId.from('owner-1');
    const store = SyncStoreId.from('store-1');
    await expect(policy.ensureCanPush(actor, store)).resolves.toBeUndefined();
    await expect(policy.ensureCanPull(actor, store)).resolves.toBeUndefined();
  });
});
