import type { EncryptedEvent, EventFilter, EventStorePort } from '@mo/application';
import type { AggregateType } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { SqliteEncryptedEventAppender, type EncryptedEventAppender } from './persistence/EncryptedEventAppender';
import { SqliteEncryptedEventReader, type EncryptedEventReader } from './persistence/EncryptedEventReader';
import type { EncryptedEventToAppend, EventTableSpec } from './persistence/types';

export class SqliteEventStore implements EventStorePort {
  private readonly spec: EventTableSpec;

  constructor(
    private readonly db: SqliteDbPort,
    aggregateType: AggregateType,
    private readonly appender: EncryptedEventAppender = new SqliteEncryptedEventAppender(),
    private readonly reader: EncryptedEventReader = new SqliteEncryptedEventReader()
  ) {
    this.spec = { table: 'events', aggregateType };
  }

  async append(aggregateId: string, eventsToAppend: EncryptedEvent[]): Promise<void> {
    if (eventsToAppend.length === 0) return;
    const minVersion = Math.min(...eventsToAppend.map((event) => event.version));
    const expectedPreviousVersion = Number.isFinite(minVersion) && minVersion > 0 ? minVersion - 1 : null;
    const toAppend: EncryptedEventToAppend[] = eventsToAppend.map((event) => ({
      eventId: event.id,
      aggregateId,
      eventType: event.eventType,
      payload: event.payload,
      version: event.version,
      occurredAt: event.occurredAt,
      actorId: event.actorId ?? null,
      causationId: event.causationId ?? null,
      correlationId: event.correlationId ?? null,
      epoch: event.epoch ?? null,
      keyringUpdate: event.keyringUpdate ?? null,
    }));

    await this.appender.appendForAggregate(
      this.db,
      this.spec,
      { aggregateId, version: expectedPreviousVersion },
      toAppend
    );
  }

  async getEvents(aggregateId: string, fromVersion = 1): Promise<EncryptedEvent[]> {
    const events = await this.reader.readForAggregate(this.db, this.spec, aggregateId, fromVersion);
    return [...events];
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    const events = await this.reader.readAll(this.db, this.spec, filter);
    return [...events];
  }
}
