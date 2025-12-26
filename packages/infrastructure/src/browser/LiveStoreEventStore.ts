import type { EncryptedEvent, EventFilter, IEventStore } from '@mo/application';
import type {
  LiveStoreEvent,
  LiveStoreSchema,
  Store,
} from '@livestore/livestore';
import { sleep } from './sleep';

type DomainEventFactory<TSchema extends LiveStoreSchema> = (payload: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
  epoch?: number;
  keyringUpdate?: Uint8Array;
}) => LiveStoreEvent.Input.ForSchema<TSchema>;
type GoalEventFactory = DomainEventFactory<LiveStoreSchema.Any>;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;
const MATERIALIZE_RETRIES = 50;
const MATERIALIZE_DELAY_MS = 5;

/**
 * LiveStore-backed event store for browser, with version checks and retries.
 * Accepts the LiveStore `events` factory to avoid schema coupling.
 */
export class BrowserLiveStoreEventStore implements IEventStore {
  constructor(
    private readonly store: Store,
    private readonly goalEvent: GoalEventFactory,
    private readonly tables: {
      events: string;
      snapshots: string;
    } = { events: 'goal_events', snapshots: 'goal_snapshots' }
  ) {}

  getStore(): Store {
    return this.store;
  }

  async append(
    aggregateId: string,
    eventsToAppend: EncryptedEvent[]
  ): Promise<void> {
    if (eventsToAppend.length === 0) return;

    const expectedStartVersion = this.getCurrentVersion(aggregateId) + 1;
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

    const expectedFinalVersion =
      expectedStartVersion + Math.max(0, sorted.length - 1);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        this.store.commit(
          ...sorted.map((event) => {
            const payload: {
              id: string;
              aggregateId: string;
              eventType: string;
              payload: Uint8Array;
              version: number;
              occurredAt: number;
              actorId: string | null;
              causationId: string | null;
              correlationId: string | null;
              epoch?: number;
              keyringUpdate?: Uint8Array;
            } = {
              id: event.id,
              aggregateId,
              eventType: event.eventType,
              payload: event.payload,
              version: event.version,
              occurredAt: event.occurredAt,
              actorId: event.actorId ?? null,
              causationId: event.causationId ?? null,
              correlationId: event.correlationId ?? null,
            };
            if (event.epoch !== undefined) {
              payload.epoch = event.epoch;
            }
            if (event.keyringUpdate !== undefined) {
              payload.keyringUpdate = event.keyringUpdate;
            }
            return this.goalEvent(payload);
          })
        );
        await this.waitForMaterialized(aggregateId, expectedFinalVersion);
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
        epoch: number | null;
        keyring_update: Uint8Array | null;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        sequence: number;
      }[]
    >({
      query: `
        SELECT id, aggregate_id, event_type, payload_encrypted, epoch, keyring_update, version, occurred_at, actor_id, causation_id, correlation_id, sequence
        FROM ${this.tables.events}
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
        epoch: number | null;
        keyring_update: Uint8Array | null;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        sequence: number;
      }[]
    >({
      query: `
        SELECT id, aggregate_id, event_type, payload_encrypted, epoch, keyring_update, version, occurred_at, actor_id, causation_id, correlation_id, sequence
        FROM ${this.tables.events}
        ${whereClause}
        ORDER BY sequence ASC
        ${limitClause}
      `,
      bindValues: params,
    });
    return rows.map(this.toEncryptedEvent);
  }

  private getCurrentVersion(aggregateId: string): number {
    const eventVersion = this.store.query<{ version: number | null }[]>({
      query: `SELECT MAX(version) as version FROM ${this.tables.events} WHERE aggregate_id = ?`,
      bindValues: [aggregateId],
    });
    const snapshotVersion = this.store.query<{ version: number | null }[]>({
      query: `SELECT version FROM ${this.tables.snapshots} WHERE aggregate_id = ? LIMIT 1`,
      bindValues: [aggregateId],
    });
    const maxEventVersion = Number(eventVersion[0]?.version ?? 0);
    const maxSnapshotVersion = Number(snapshotVersion[0]?.version ?? 0);
    return Math.max(maxEventVersion, maxSnapshotVersion);
  }

  private async waitForMaterialized(
    aggregateId: string,
    expectedVersion: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= MATERIALIZE_RETRIES; attempt += 1) {
      const current = this.getCurrentVersion(aggregateId);
      if (current >= expectedVersion) return;
      await sleep(MATERIALIZE_DELAY_MS);
    }
    throw new Error(
      `Timed out waiting for event materialization for ${aggregateId} (expected version ${expectedVersion})`
    );
  }

  private toEncryptedEvent(row: {
    id: string;
    aggregate_id: string;
    event_type: string;
    payload_encrypted: Uint8Array;
    epoch: number | null;
    keyring_update: Uint8Array | null;
    version: number;
    occurred_at: number;
    actor_id: string | null;
    causation_id: string | null;
    correlation_id: string | null;
    sequence: number;
  }): EncryptedEvent {
    return {
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      epoch: row.epoch ?? undefined,
      keyringUpdate: row.keyring_update ?? undefined,
      version: Number(row.version),
      occurredAt: Number(row.occurred_at),
      actorId: row.actor_id,
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      sequence: Number(row.sequence),
    };
  }
}
