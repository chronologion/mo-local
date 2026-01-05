import { SyncAccessPolicy } from '../../src/sync/application/ports/sync-access-policy';
import { SyncStoreRepository } from '../../src/sync/application/ports/sync-store-repository';
import { SyncService } from '../../src/sync/application/sync.service';
import { SyncIncomingEvent } from '../../src/sync/domain/SyncEvent';
import { SyncOwnerId } from '../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../src/sync/domain/value-objects/SyncStoreId';
import { InMemorySyncEventRepository } from './support/in-memory-sync-event-repository';

const ownerId = SyncOwnerId.from('owner-1');
const storeId = SyncStoreId.from('store-1');

class AllowAllAccessPolicy extends SyncAccessPolicy {
  async ensureCanPull(): Promise<void> {}
  async ensureCanPush(): Promise<void> {}
}

class InMemorySyncStoreRepository extends SyncStoreRepository {
  private owners = new Map<string, string>();

  async ensureStoreOwner(storeId: SyncStoreId, ownerId: SyncOwnerId): Promise<void> {
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    const existing = this.owners.get(storeIdValue);
    if (existing) {
      if (existing !== ownerValue) {
        throw new Error('Store owned by another identity');
      }
      return;
    }
    this.owners.set(storeIdValue, ownerValue);
  }
}

const makeEvent = (eventId: string, payload: number): SyncIncomingEvent => ({
  eventId,
  recordJson: JSON.stringify({ payload }),
});

describe('SyncService', () => {
  let repository: InMemorySyncEventRepository;
  let storeRepository: InMemorySyncStoreRepository;
  let service: SyncService;

  beforeEach(() => {
    repository = new InMemorySyncEventRepository();
    storeRepository = new InMemorySyncStoreRepository();
    service = new SyncService(repository, storeRepository, new AllowAllAccessPolicy());
  });

  it('pushes a batch and updates head', async () => {
    const batch = [makeEvent('e1', 1), makeEvent('e2', 2)];
    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: batch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.head.unwrap()).toBe(2);
      expect(result.assigned).toEqual([
        { eventId: 'e1', globalSequence: GlobalSequenceNumber.from(1) },
        { eventId: 'e2', globalSequence: GlobalSequenceNumber.from(2) },
      ]);
    }

    const pulled = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(0),
      limit: 10,
    });
    expect(pulled.events.map((event) => event.eventId)).toEqual(['e1', 'e2']);
    expect(pulled.head.unwrap()).toBe(2);
  });

  it('returns conflict when server is ahead', async () => {
    await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [makeEvent('e1', 1)],
    });

    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [makeEvent('e2', 2)],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('server_ahead');
      expect(result.head.unwrap()).toBe(1);
      expect(result.missing?.map((event) => event.eventId)).toEqual(['e1']);
    }
  });

  it('returns conflict when server is behind', async () => {
    await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [makeEvent('e1', 1)],
    });

    await repository.resetStore(ownerId, storeId);

    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(1),
      events: [makeEvent('e2', 2)],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('server_behind');
      expect(result.head.unwrap()).toBe(0);
      expect(result.missing).toBeUndefined();
    }
  });

  it('reuses assignments for idempotent events', async () => {
    await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [makeEvent('e1', 1)],
    });
    const result = await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(1),
      events: [makeEvent('e1', 1)],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.head.unwrap()).toBe(1);
      expect(result.assigned).toEqual([{ eventId: 'e1', globalSequence: GlobalSequenceNumber.from(1) }]);
    }
  });

  it('pulls events after a cursor with pagination limit', async () => {
    await service.pushEvents({
      ownerId,
      storeId,
      expectedHead: GlobalSequenceNumber.from(0),
      events: [makeEvent('e1', 1), makeEvent('e2', 2), makeEvent('e3', 3)],
    });

    const firstPage = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(0),
      limit: 2,
    });

    expect(firstPage.events.map((event) => event.eventId)).toEqual(['e1', 'e2']);

    const secondPage = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(2),
      limit: 2,
    });

    expect(secondPage.events.map((event) => event.eventId)).toEqual(['e3']);
  });
});
