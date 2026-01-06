import {
  SyncEventRepository,
  SyncRepositoryHeadMismatchError,
} from '../../../src/sync/application/ports/sync-event-repository';
import { SyncEvent, SyncIncomingEvent } from '../../../src/sync/domain/SyncEvent';
import { GlobalSequenceNumber } from '../../../src/sync/domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../../src/sync/domain/value-objects/SyncStoreId';

export class InMemorySyncEventRepository extends SyncEventRepository {
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
        (stored) =>
          stored.ownerId.unwrap() === ownerId.unwrap() &&
          stored.storeId.unwrap() === storeId.unwrap() &&
          stored.eventId === event.eventId
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
