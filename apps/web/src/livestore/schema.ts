import { Events, makeSchema, State } from '@livestore/livestore';
import * as S from 'effect/Schema';

// LiveStore schema mirroring our encrypted goal event log.
// Payloads remain ciphertext (Uint8Array); no plaintext at rest.

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

export const tables = {
  goal_events: goalEventsTable,
};

type GoalEventPayload = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array<ArrayBufferLike>;
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
      payload: S.Uint8ArrayFromSelf,
      version: S.Number,
      occurredAt: S.Number, // epoch millis
    }),
  }),
};

const materializers = State.SQLite.materializers(events, {
  'goal.event': ({
    id,
    aggregateId,
    eventType,
    payload,
    version,
    occurredAt,
  }: GoalEventPayload) =>
    tables.goal_events.insert({
      id,
      aggregate_id: aggregateId,
      event_type: eventType,
      // LiveStore decodes payload as Uint8Array<ArrayBufferLike>; insert expects Uint8Array<ArrayBuffer>.
      payload_encrypted: payload as Uint8Array<ArrayBuffer>,
      version,
      occurred_at: occurredAt,
    }),
});

const state = State.SQLite.makeState({
  tables,
  materializers,
});

export const schema = makeSchema({ state, events });
