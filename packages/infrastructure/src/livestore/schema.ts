import { Events, makeSchema, State } from '@livestore/livestore';
import * as S from 'effect/Schema';
import { goalTables, materializeGoalEvent } from '../goals/schema';
import { projectTables, materializeProjectEvent } from '../projects/schema';
import type { DomainEventPayload } from './types';

const idempotencyKeysTable = State.SQLite.table({
  name: 'idempotency_keys',
  columns: {
    idempotency_key: State.SQLite.text({ nullable: false, primaryKey: true }),
    command_type: State.SQLite.text({ nullable: false }),
    aggregate_id: State.SQLite.text({ nullable: false }),
    created_at: State.SQLite.integer({ nullable: false }),
  },
});

export const tables = {
  ...goalTables,
  ...projectTables,
  idempotency_keys: idempotencyKeysTable,
};

export const events = {
  domainEvent: Events.synced({
    name: 'event.v1',
    schema: S.Struct({
      id: S.String,
      aggregateId: S.String,
      eventType: S.String,
      payload: S.Unknown,
      epoch: S.optional(S.Number),
      keyringUpdate: S.optional(S.Unknown),
      version: S.Number,
      occurredAt: S.Number,
      actorId: S.NullOr(S.String),
      causationId: S.NullOr(S.String),
      correlationId: S.NullOr(S.String),
    }),
  }),
};

const asUint8Array = (payload: unknown): Uint8Array => {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (
    payload &&
    typeof (payload as { buffer?: ArrayBuffer }).buffer === 'object'
  ) {
    return new Uint8Array((payload as { buffer: ArrayBuffer }).buffer);
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Object.keys(payload).length > 0 &&
    Object.keys(payload).every((key) => Number.isInteger(Number(key)))
  ) {
    const entries = Object.entries(payload as Record<string, number>);
    const sorted = entries
      .map(([key, value]) => [Number(key), value] as const)
      .sort((a, b) => a[0] - b[0]);
    const result = new Uint8Array(sorted.length);
    for (let index = 0; index < sorted.length; index += 1) {
      const value = sorted[index]?.[1];
      result[index] = typeof value === 'number' ? value : 0;
    }
    return result;
  }
  throw new Error('Invalid payload type for domain event');
};

const materializers = State.SQLite.materializers(events, {
  'event.v1': (payload: DomainEventPayload) => {
    try {
      const payloadBytes = asUint8Array(
        payload.payload
      ) as Uint8Array<ArrayBuffer>;
      const keyringBytes = payload.keyringUpdate
        ? (asUint8Array(payload.keyringUpdate) as Uint8Array<ArrayBuffer>)
        : null;
      const updates = [
        ...materializeGoalEvent(payload, payloadBytes, keyringBytes),
        ...materializeProjectEvent(payload, payloadBytes, keyringBytes),
      ];

      if (updates.length === 0) {
        console.warn('[event.v1 materializer] unknown event type', {
          id: payload.id,
          aggregateId: payload.aggregateId,
          eventType: payload.eventType,
          version: payload.version,
          occurredAt: payload.occurredAt,
        });
      }

      return updates;
    } catch (error) {
      console.error('[event.v1 materializer] failed to normalize payload', {
        error,
        aggregateId: payload.aggregateId,
        eventType: payload.eventType,
        version: payload.version,
        occurredAt: payload.occurredAt,
      });
      return [];
    }
  },
});

const state = State.SQLite.makeState({
  tables,
  materializers,
});

export const schema = makeSchema({ state, events });
