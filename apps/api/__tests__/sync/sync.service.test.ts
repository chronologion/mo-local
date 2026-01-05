import {
  SyncEventRepository,
  SyncRepositoryHeadMismatchError,
} from '../../src/sync/application/ports/sync-event-repository';
import { SyncAccessPolicy } from '../../src/sync/application/ports/sync-access-policy';
import { SyncStoreRepository } from '../../src/sync/application/ports/sync-store-repository';
import { SyncService } from '../../src/sync/application/sync.service';
import { SyncEvent, SyncIncomingEvent } from '../../src/sync/domain/SyncEvent';
import { GlobalSequenceNumber } from '../../src/sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../src/sync/domain/value-objects/SyncStoreId';

class InMemorySyncEventRepository extends SyncEventRepository {
  private events: SyncEvent[] = [];
  private heads = new Map<string, number>();

  async getHeadSequence(ownerId: SyncOwnerId, storeId: SyncStoreId): Promise<GlobalSequenceNumber> {
    return GlobalSequenceNumber.from(this.heads.get(`${ownerId.unwrap()}::${storeId.unwrap()}`) ?? 0);
  }

  async appendBatch(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    expectedHead: GlobalSequenceNumber;
    events: ReadonlyArray<SyncIncomingEvent>;
  }) {
    const { ownerId, storeId, expectedHead, events } = params;
    const key = `${ownerId.unwrap()}::${storeId.unwrap()}`;
    const head = await this.getHeadSequence(ownerId, storeId);
    if (head.unwrap() !== expectedHead.unwrap()) {
      throw new SyncRepositoryHeadMismatchError(head, expectedHead);
    }
    let currentHead = head.unwrap();
    const assigned = events.map((event) => {
      const existing = this.events.find(
        (e) =>
          e.ownerId.unwrap() === ownerId.unwrap() &&
          e.storeId.unwrap() === storeId.unwrap() &&
          e.eventId === event.eventId
      );
      if (existing) {
        return {
          eventId: event.eventId,
          globalSequence: existing.globalSequence,
        };
      }
      currentHead += 1;
      const stored: SyncEvent = {
        ownerId,
        storeId,
        globalSequence: GlobalSequenceNumber.from(currentHead),
        eventId: event.eventId,
        recordJson: event.recordJson,
        createdAt: new Date(),
      };
      this.events.push(stored);
      return {
        eventId: event.eventId,
        globalSequence: stored.globalSequence,
      };
    });
    this.events.sort((a, b) => a.globalSequence.unwrap() - b.globalSequence.unwrap());
    this.heads.set(key, currentHead);
    return { head: GlobalSequenceNumber.from(currentHead), assigned };
  }

  async loadSince(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId,
    since: GlobalSequenceNumber,
    limit: number
  ): Promise<SyncEvent[]> {
    return this.events
      .filter(
        (event) =>
          event.ownerId.unwrap() === ownerId.unwrap() &&
          event.storeId.unwrap() === storeId.unwrap() &&
          event.globalSequence.unwrap() > since.unwrap()
      )
      .sort((a, b) => a.globalSequence.unwrap() - b.globalSequence.unwrap())
      .slice(0, limit);
  }

  async resetStore(ownerId: SyncOwnerId, storeId: SyncStoreId): Promise<void> {
    this.events = this.events.filter((event) => {
      return event.ownerId.unwrap() !== ownerId.unwrap() || event.storeId.unwrap() !== storeId.unwrap();
    });
    this.heads.set(`${ownerId.unwrap()}::${storeId.unwrap()}`, 0);
  }
}

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
