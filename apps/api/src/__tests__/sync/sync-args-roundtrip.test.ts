import { describe, expect, it, beforeEach } from 'vitest';
import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
  SyncRepositoryHeadMismatchError,
} from '../../sync/application/ports/sync-event-repository';
import { SyncAccessPolicy } from '../../sync/application/ports/sync-access-policy';
import { SyncStoreRepository } from '../../sync/application/ports/sync-store-repository';
import { SyncService } from '../../sync/application/sync.service';
import { SyncEvent } from '../../sync/domain/SyncEvent';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import {
  parseArgs,
  serializeArgs,
} from '../../sync/infrastructure/kysely-sync-event.repository';

type StoredEvent = {
  ownerId: SyncOwnerId;
  storeId: SyncStoreId;
  seqNum: GlobalSequenceNumber;
  parentSeqNum: GlobalSequenceNumber;
  name: string;
  argsSerialized: string;
  clientId: string;
  sessionId: string;
  createdAt: Date;
};

class SerializedSyncEventRepository extends SyncEventRepository {
  private events: StoredEvent[] = [];

  getStoredArgs(seqNum: number): string | undefined {
    return this.events.find((event) => event.seqNum.unwrap() === seqNum)
      ?.argsSerialized;
  }

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

  async appendBatch(
    events: SyncEvent[],
    expectedParent: GlobalSequenceNumber
  ): Promise<GlobalSequenceNumber> {
    if (events.length === 0) return expectedParent;
    const owner = events[0]?.ownerId ?? ownerId;
    const store = events[0]?.storeId ?? storeId;
    const head = await this.getHeadSequence(owner, store);
    if (head.unwrap() !== expectedParent.unwrap()) {
      throw new SyncRepositoryHeadMismatchError(head, expectedParent);
    }
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
      this.events.push({
        ownerId: event.ownerId,
        storeId: event.storeId,
        seqNum: event.seqNum,
        parentSeqNum: event.parentSeqNum,
        name: event.name,
        argsSerialized: serializeArgs(event.args),
        clientId: event.clientId,
        sessionId: event.sessionId,
        createdAt: event.createdAt,
      });
    }
    this.events.sort((a, b) => a.seqNum.unwrap() - b.seqNum.unwrap());
    const last = events[events.length - 1];
    return GlobalSequenceNumber.from(last?.seqNum.unwrap() ?? head.unwrap());
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
      .slice(0, limit)
      .map((event) => ({
        ownerId: event.ownerId,
        storeId: event.storeId,
        seqNum: event.seqNum,
        parentSeqNum: event.parentSeqNum,
        name: event.name,
        args: parseArgs(event.argsSerialized),
        clientId: event.clientId,
        sessionId: event.sessionId,
        createdAt: event.createdAt,
      }));
  }
}

class AllowAllAccessPolicy extends SyncAccessPolicy {
  async ensureCanPull(): Promise<void> {}
  async ensureCanPush(): Promise<void> {}
}

class InMemorySyncStoreRepository extends SyncStoreRepository {
  private owners = new Map<string, string>();

  async ensureStoreOwner(
    storeId: SyncStoreId,
    ownerId: SyncOwnerId
  ): Promise<void> {
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    const existing = this.owners.get(storeIdValue);
    if (existing && existing !== ownerValue) {
      throw new Error('Store owned by another identity');
    }
    if (!existing) {
      this.owners.set(storeIdValue, ownerValue);
    }
  }
}

const ownerId = SyncOwnerId.from('owner-1');
const storeId = SyncStoreId.from('store-1');

const makeEvent = (
  seqNum: number,
  parentSeqNum: number,
  args: Record<string, unknown>
): LiveStoreEvent.Global.Encoded => ({
  name: 'event.v1',
  args,
  seqNum: EventSequenceNumber.Global.make(seqNum),
  parentSeqNum: EventSequenceNumber.Global.make(parentSeqNum),
  clientId: 'client-1',
  sessionId: 'session-1',
});

describe('Sync args byte preservation', () => {
  let repository: SerializedSyncEventRepository;
  let storeRepository: InMemorySyncStoreRepository;
  let service: SyncService;

  beforeEach(() => {
    repository = new SerializedSyncEventRepository();
    storeRepository = new InMemorySyncStoreRepository();
    service = new SyncService(
      repository,
      storeRepository,
      new AllowAllAccessPolicy()
    );
  });

  it('preserves JSON string bytes across push → store → pull', async () => {
    const args = { b: 1, a: 2, nested: { z: 3, y: 4 } };
    await service.pushEvents({
      ownerId,
      storeId,
      events: [makeEvent(1, 0, args)],
    });

    const stored = repository.getStoredArgs(1);
    expect(stored).toBe(JSON.stringify(args));

    const pulled = await service.pullEvents({
      ownerId,
      storeId,
      since: GlobalSequenceNumber.from(0),
      limit: 10,
    });
    expect(pulled.events).toHaveLength(1);
    const pulledArgs = pulled.events[0]?.args;
    expect(JSON.stringify(pulledArgs)).toBe(stored);
  });
});
