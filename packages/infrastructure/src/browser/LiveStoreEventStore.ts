import type { EncryptedEvent, EventFilter, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { EventSequenceNumber } from '@livestore/common/schema';
import { sleep } from './sleep';

type GoalEventFactory = (payload: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
}) => unknown;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

/**
 * LiveStore-backed event store for browser, with version checks and retries.
 * Accepts the LiveStore `events` factory to avoid schema coupling.
 */
export class BrowserLiveStoreEventStore implements IEventStore {
  constructor(
    private readonly store: Store,
    private readonly goalEvent: GoalEventFactory
  ) {}

  getStore(): Store {
    return this.store;
  }

  async append(
    aggregateId: string,
    eventsToAppend: EncryptedEvent[]
  ): Promise<void> {
    if (eventsToAppend.length === 0) return;

    const existing = await this.getEvents(aggregateId);
    const expectedStartVersion = existing.length + 1;
    const sorted = [...eventsToAppend].sort((a, b) => a.version - b.version);
    if (sorted[0]?.version !== expectedStartVersion) {
      throw new Error(
        `Version conflict for ${aggregateId}: expected ${expectedStartVersion}`
      );
    }
    for (let idx = 1; idx < sorted.length; idx += 1) {
      const expected = expectedStartVersion + idx;
      if (sorted[idx]?.version !== expected) {
        throw new Error(
          `Non-monotonic versions for ${aggregateId}: expected ${expected}`
        );
      }
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        this.store.commit(
          ...sorted.map(
            (event) =>
              this.goalEvent({
                id: event.id,
                aggregateId,
                eventType: event.eventType,
                payload: event.payload,
                version: event.version,
                occurredAt: event.occurredAt,
              }) as never
          )
        );
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    const results: EncryptedEvent[] = [];
    for await (const event of this.iterateEvents({
      aggregateId,
      minVersion: fromVersion,
    })) {
      results.push(event);
    }
    return results;
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    const results: EncryptedEvent[] = [];
    let count = 0;
    for await (const event of this.iterateEvents({
      aggregateId: filter?.aggregateId,
      eventType: filter?.eventType,
      minSequence: filter?.since,
    })) {
      results.push(event);
      count += 1;
      if (filter?.limit && count >= filter.limit) {
        break;
      }
    }
    return results;
  }

  private cursorFrom(sequence?: number) {
    if (sequence === undefined) return undefined;
    return {
      global: EventSequenceNumber.Global.make(sequence),
      client: EventSequenceNumber.Client.DEFAULT,
      rebaseGeneration: EventSequenceNumber.Client.REBASE_GENERATION_DEFAULT,
    };
  }

  private async *iterateEvents(params: {
    aggregateId?: string;
    eventType?: string;
    minSequence?: number;
    minVersion?: number;
  }): AsyncIterable<EncryptedEvent> {
    const cursor = this.cursorFrom(
      params.minSequence !== undefined ? params.minSequence + 1 : undefined
    );
    const iterable = this.store.events({
      cursor,
      filter: ['goal.event'],
    });
    for await (const event of iterable) {
      const { name, args, seqNum } = event;
      if (name !== 'goal.event') continue;
      const encrypted = {
        id: (args as any).id as string,
        aggregateId: (args as any).aggregateId as string,
        eventType: (args as any).eventType as string,
        payload: (args as any).payload as Uint8Array,
        version: Number((args as any).version),
        occurredAt: Number((args as any).occurredAt),
        sequence: Number(seqNum.global ?? 0),
      } satisfies EncryptedEvent;
      if (params.aggregateId && encrypted.aggregateId !== params.aggregateId) {
        continue;
      }
      if (params.eventType && encrypted.eventType !== params.eventType) {
        continue;
      }
      if (params.minVersion && encrypted.version < params.minVersion) {
        continue;
      }
      yield encrypted;
    }
  }
}
