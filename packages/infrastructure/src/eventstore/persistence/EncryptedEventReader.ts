import type { SqliteDbPort } from '@mo/eventstore-web';
import type { EncryptedEvent, EventFilter } from '@mo/application';
import type { EventTableSpec } from './types';

export interface EncryptedEventReader {
  readForAggregate(
    db: SqliteDbPort,
    spec: EventTableSpec,
    aggregateId: string,
    fromVersion?: number
  ): Promise<ReadonlyArray<EncryptedEvent>>;

  readAll(db: SqliteDbPort, spec: EventTableSpec, filter?: EventFilter): Promise<ReadonlyArray<EncryptedEvent>>;
}

export class SqliteEncryptedEventReader implements EncryptedEventReader {
  async readForAggregate(
    db: SqliteDbPort,
    spec: EventTableSpec,
    aggregateId: string,
    fromVersion = 1
  ): Promise<ReadonlyArray<EncryptedEvent>> {
    const rows = await db.query<
      Readonly<{
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        commit_sequence: number;
      }>
    >(
      `
        SELECT
          id,
          aggregate_id,
          event_type,
          payload_encrypted,
          version,
          occurred_at,
          actor_id,
          causation_id,
          correlation_id,
          commit_sequence
        FROM ${spec.table}
        WHERE aggregate_type = ? AND aggregate_id = ? AND version >= ?
        ORDER BY version ASC
      `,
      [spec.aggregateType, aggregateId, fromVersion]
    );

    return rows.map((row) => this.toEncryptedEvent({ ...row, aggregate_type: spec.aggregateType }));
  }

  async readAll(db: SqliteDbPort, spec: EventTableSpec, filter?: EventFilter): Promise<ReadonlyArray<EncryptedEvent>> {
    const conditions: string[] = ['aggregate_type = ?'];
    const params: Array<string | number> = [spec.aggregateType];

    if (filter?.aggregateId) {
      conditions.push('aggregate_id = ?');
      params.push(filter.aggregateId);
    }
    if (filter?.eventType) {
      conditions.push('event_type = ?');
      params.push(filter.eventType);
    }
    if (filter?.since) {
      conditions.push('commit_sequence > ?');
      params.push(filter.since);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filter?.limit ? 'LIMIT ?' : '';
    if (filter?.limit) {
      params.push(filter.limit);
    }

    const rows = await db.query<
      Readonly<{
        id: string;
        aggregate_id: string;
        event_type: string;
        payload_encrypted: Uint8Array;
        version: number;
        occurred_at: number;
        actor_id: string | null;
        causation_id: string | null;
        correlation_id: string | null;
        commit_sequence: number;
      }>
    >(
      `
        SELECT
          id,
          aggregate_id,
          event_type,
          payload_encrypted,
          version,
          occurred_at,
          actor_id,
          causation_id,
          correlation_id,
          commit_sequence
        FROM ${spec.table}
        ${whereClause}
        ORDER BY commit_sequence ASC
        ${limitClause}
      `,
      params
    );

    return rows.map((row) => this.toEncryptedEvent({ ...row, aggregate_type: spec.aggregateType }));
  }

  private toEncryptedEvent(row: {
    id: string;
    aggregate_id: string;
    event_type: string;
    payload_encrypted: Uint8Array;
    version: number;
    occurred_at: number;
    actor_id: string | null;
    causation_id: string | null;
    correlation_id: string | null;
    commit_sequence: number;
    aggregate_type?: string;
  }): EncryptedEvent {
    return {
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload_encrypted,
      version: row.version,
      occurredAt: row.occurred_at,
      actorId: row.actor_id,
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      sequence: row.commit_sequence,
    };
  }
}
