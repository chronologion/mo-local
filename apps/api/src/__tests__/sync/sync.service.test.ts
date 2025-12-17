import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
} from '../../sync/application/ports/sync-event-repository';
import { SyncAccessPolicy } from '../../sync/application/ports/sync-access-policy';
import { SyncService } from '../../sync/application/sync.service';
import { SyncEvent } from '../../sync/domain/SyncEvent';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';

class InMemorySyncEventRepository extends SyncEventRepository {
  private events: SyncEvent[] = [];

  async getHeadSequence(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<GlobalSequenceNumber> {
    const head = this.events
      .filter(
        (event) =>
          event.ownerId.unwrap() === ownerId.unwrap() &&
          event.storeId.unwrap() === storeId.unwrap()
      )
      .reduce((max, event) => Math.max(max, event.seqNum.unwrap()), 0);
    return GlobalSequenceNumber.from(head);
  }

  async appendBatch(events: SyncEvent[]): Promise<void> {
    for (const event of events) {
      const exists = this.events.some(
        (e) =>
          e.ownerId.unwrap() === event.ownerId.unwrap() &&
          e.storeId.unwrap() === event.storeId.unwrap() &&
          e.seqNum.unwrap() === event.seqNum.unwrap()
      );
      if (exists) {
        throw new SyncRepositoryConflictError(
          'Duplicate sequence number for stream'
        );
      }
      this.events.push(event);
    }
    this.events.sort((a, b) => a.seqNum.unwrap() - b.seqNum.unwrap());
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
          event.seqNum.unwrap() > since.unwrap()
      )
      .sort((a, b) => a.seqNum.unwrap() - b.seqNum.unwrap())
      .slice(0, limit);
  }
}

const ownerId = SyncOwnerId.from('owner-1');
const storeId = SyncStoreId.from('store-1');

class AllowAllAccessPolicy extends SyncAccessPolicy {
  async ensureCanPull(): Promise<void> {}
  async ensureCanPush(): Promise<void> {}
}

const makeEvent = (
  seqNum: number,
  parentSeqNum: number
): LiveStoreEvent.Global.Encoded => ({
  name: 'test.event',
  args: { payload: seqNum },
  seqNum: EventSequenceNumber.Global.make(seqNum),
  parentSeqNum: EventSequenceNumber.Global.make(parentSeqNum),
  clientId: 'client-1',
  sessionId: 'session-1',
});

describe('SyncService', () => {
  let repository: InMemorySyncEventRepository;
  let service: SyncService;

  beforeEach(() => {
    repository = new InMemorySyncEventRepository();
    service = new SyncService(repository, new AllowAllAccessPolicy());
  });

  it('pushes a valid ascending batch and updates head', async () => {
    const batch = [makeEvent(1, 0), makeEvent(2, 1)];
    const result = await service.pushEvents({
      ownerId,
      storeId,
      events: batch,
    });
    expect(result.lastSeqNum.unwrap()).toBe(2);

    const pulled = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(0),
      limit: 10,
    });
    expect(pulled.events).toEqual([
      expect.objectContaining({ seqNum: GlobalSequenceNumber.from(1) }),
      expect.objectContaining({ seqNum: GlobalSequenceNumber.from(2) }),
    ]);
    expect(pulled.head.unwrap()).toBe(2);
  });

  it('accepts non-ascending batches and reassigns server sequence numbers', async () => {
    const batch = [makeEvent(5, 4), makeEvent(1, 0)];
    const result = await service.pushEvents({
      ownerId,
      storeId,
      events: batch,
    });
    expect(result.lastSeqNum.unwrap()).toBe(2);

    const pulled = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(0),
      limit: 10,
    });
    expect(pulled.events.map((e) => e.seqNum.unwrap())).toEqual([1, 2]);
  });

  it('pulls events after a cursor with pagination limit', async () => {
    await service.pushEvents({
      ownerId,
      storeId,
      events: [makeEvent(1, 0), makeEvent(2, 1), makeEvent(3, 2)],
    });

    const result = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(1),
      limit: 1,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.seqNum.unwrap()).toBe(2);
    expect(result.head.unwrap()).toBe(2);
  });
});
