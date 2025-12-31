import { EncryptedEvent, EventFilter } from './types';

/**
 * Event store boundary used by application services.
 */
export interface EventStorePort {
  append(aggregateId: string, events: EncryptedEvent[]): Promise<void>;

  getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<EncryptedEvent[]>;

  getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]>;
}
