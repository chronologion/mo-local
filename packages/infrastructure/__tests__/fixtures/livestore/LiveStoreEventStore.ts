import { ConcurrencyError } from '@mo/application';
import { EncryptedEvent, EventFilter, EventStorePort } from '@mo/application';

/**
 * Minimal in-memory implementation of EventStorePort.
 *
 * Simulates LiveStore behavior: assigns sequence numbers, enforces
 * monotonic versions per aggregate, and supports basic filtering.
 */
export class LiveStoreEventStore implements EventStorePort {
  private readonly eventsByAggregate = new Map<string, StoredEvent[]>();
  private globalSequence = 0;

  async append(aggregateId: string, events: EncryptedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const current = this.eventsByAggregate.get(aggregateId) ?? [];
    const expectedVersionStart = current.length + 1;

    events.forEach((event, idx) => {
      const expectedVersion = expectedVersionStart + idx;
      if (event.version !== expectedVersion) {
        throw new ConcurrencyError(
          `Expected version ${expectedVersion} but received ${event.version} for ${aggregateId}`
        );
      }
    });

    const assigned = events.map((event) => {
      const sequence = this.globalSequence + 1;
      this.globalSequence = sequence;
      return { ...event, sequence };
    });

    this.eventsByAggregate.set(aggregateId, [...current, ...assigned]);
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<StoredEvent[]> {
    const events = this.eventsByAggregate.get(aggregateId) ?? [];
    return events
      .filter((e) => e.version >= fromVersion)
      .sort((a, b) => a.version - b.version);
  }

  async getAllEvents(filter?: EventFilter): Promise<StoredEvent[]> {
    const all = Array.from(this.eventsByAggregate.values()).flat();

    return all
      .filter((e) => {
        if (filter?.aggregateId && e.aggregateId !== filter.aggregateId)
          return false;
        if (filter?.eventType && e.eventType !== filter.eventType) return false;
        if (filter?.since && e.sequence <= filter.since) return false;
        return true;
      })
      .sort((a, b) => a.sequence - b.sequence);
  }
}

type StoredEvent = EncryptedEvent & { sequence: number };
