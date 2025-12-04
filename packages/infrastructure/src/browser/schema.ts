import { Events, makeSchema, State } from '@livestore/livestore';
import * as S from 'effect/Schema';

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

const state = State.SQLite.makeState({
  tables,
  materializers: {},
});

export const schema = makeSchema({ state, events });
