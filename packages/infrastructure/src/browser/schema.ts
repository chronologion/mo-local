import { Events, makeSchema, State } from '@livestore/livestore';
import * as S from 'effect/Schema';

// LiveStore schema mirroring encrypted goal event log (ciphertext only).
const goalEventsTable = State.SQLite.table({
  name: 'goal_events',
  columns: {
    sequence: State.SQLite.integer({
      primaryKey: true,
      autoIncrement: true,
      nullable: true,
    }),
    id: State.SQLite.text({ nullable: false }),
    aggregate_id: State.SQLite.text({ nullable: false }),
    event_type: State.SQLite.text({ nullable: false }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    version: State.SQLite.integer({ nullable: false }),
    occurred_at: State.SQLite.integer({ nullable: false }),
  },
});

const goalSnapshotsTable = State.SQLite.table({
  name: 'goal_snapshots',
  columns: {
    aggregate_id: State.SQLite.text({ nullable: false, primaryKey: true }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    version: State.SQLite.integer({ nullable: false }),
    last_sequence: State.SQLite.integer({ nullable: false }),
    updated_at: State.SQLite.integer({ nullable: false }),
  },
});

const goalProjectionMetaTable = State.SQLite.table({
  name: 'goal_projection_meta',
  columns: {
    key: State.SQLite.text({ nullable: false, primaryKey: true }),
    value: State.SQLite.text({ nullable: false }),
  },
});

const goalAnalyticsTable = State.SQLite.table({
  name: 'goal_analytics',
  columns: {
    aggregate_id: State.SQLite.text({ nullable: false, primaryKey: true }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    last_sequence: State.SQLite.integer({ nullable: false }),
    updated_at: State.SQLite.integer({ nullable: false }),
  },
});

export const tables = {
  goal_events: goalEventsTable,
  goal_snapshots: goalSnapshotsTable,
  goal_projection_meta: goalProjectionMetaTable,
  goal_analytics: goalAnalyticsTable,
};

type GoalEventPayload = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  version: number;
  occurredAt: number;
};

export const events = {
  goalEvent: Events.synced({
    name: 'goal.event',
    schema: S.Struct({
      id: S.String,
      aggregateId: S.String,
      eventType: S.String,
      payload: S.Unknown,
      version: S.Number,
      occurredAt: S.Number,
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
  throw new Error('Invalid payload type for goal event');
};

const materializers = State.SQLite.materializers(events, {
  'goal.event': ({
    id,
    aggregateId,
    eventType,
    payload,
    version,
    occurredAt,
  }: GoalEventPayload) => {
    try {
      console.info('[goal.event materializer] inserting event', {
        id,
        aggregateId,
        eventType,
        version,
        occurredAt,
      });
      return [
        tables.goal_events.insert({
          id,
          aggregate_id: aggregateId,
          event_type: eventType,
          payload_encrypted: asUint8Array(payload) as Uint8Array<ArrayBuffer>,
          version,
          occurred_at: occurredAt,
        }),
      ];
    } catch (error) {
      console.error('[goal.event materializer] failed to normalize payload', {
        error,
        aggregateId,
        eventType,
        version,
        occurredAt,
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
