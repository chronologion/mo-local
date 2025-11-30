import type { EncryptedEvent, EventFilter, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { events } from '../livestore/schema';
import { sleep } from '../lib/sleep';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

/**
 * Bridges LiveStore's commit/query APIs to the IEventStore interface used by our domain services.
 * Events are stored as ciphertext (Uint8Array payload); no plaintext is persisted.
 */
export class LiveStoreEventStore implements IEventStore {
  constructor(private readonly store: Store) {}

  getStore(): Store {
    return this.store;
  }

  async append(
    aggregateId: string,
    eventsToAppend: EncryptedEvent[]
  ): Promise<void> {
    if (eventsToAppend.length === 0) return;

    const existing = this.store.query<{ version: number | null }[]>({
      query:
        'SELECT MAX(version) as version FROM goal_events WHERE aggregate_id = ?',
      bindValues: [aggregateId],
    });
    const expectedStartVersion = Number(existing[0]?.version ?? 0) + 1;
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
          ...sorted.map((event) =>
            events.goalEvent({
              id: event.id,
              aggregateId,
              eventType: event.eventType,
              payload: event.payload,
              version: event.version,
              occurredAt: event.occurredAt,
            })
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
    const rows = this.store.query<
      {
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        version: number;
        occurred_at: number;
        sequence: number;
      }[]
    >({
      query: `
        SELECT id, aggregate_id, event_type, payload_encrypted, version, occurred_at, sequence
        FROM goal_events
        WHERE aggregate_id = ? AND version >= ?
        ORDER BY version ASC
      `,
      bindValues: [aggregateId, fromVersion],
    });

    return rows.map(this.toEncryptedEvent);
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.aggregateId) {
      conditions.push('aggregate_id = ?');
      params.push(filter.aggregateId);
    }
    if (filter?.eventType) {
      conditions.push('event_type = ?');
      params.push(filter.eventType);
    }
    if (filter?.since) {
      conditions.push('sequence > ?');
      params.push(filter.since);
    }
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const limitClause = filter?.limit ? 'LIMIT ?' : '';
    if (filter?.limit) {
      params.push(filter.limit);
    }

    const rows = this.store.query<
      {
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        version: number;
        occurred_at: number;
        sequence: number;
      }[]
    >({
      query: `
        SELECT id, aggregate_id, event_type, payload_encrypted, version, occurred_at, sequence
        FROM goal_events
        ${whereClause}
        ORDER BY sequence ASC
        ${limitClause}
      `,
      bindValues: params,
    });

    return rows.map(this.toEncryptedEvent);
  }

  private toEncryptedEvent(row: {
    id: string;
    aggregate_id: string;
    event_type: string;
    payload_encrypted: Uint8Array;
    version: number;
    occurred_at: number;
    sequence: number;
  }): EncryptedEvent {
    return {
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: Number(row.version),
      occurredAt: Number(row.occurred_at),
      sequence: Number(row.sequence),
    };
  }
}
