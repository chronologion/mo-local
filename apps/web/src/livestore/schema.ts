import { Events, makeSchema, Schema, State } from '@livestore/livestore';

// LiveStore re-exports the Effect Schema utilities; the type surface lacks static members in the d.ts,
// so we cast to any for the builder helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = Schema;

// LiveStore schema mirroring our encrypted goal event log.
// Payloads remain ciphertext (Uint8Array); no plaintext at rest.

const goalEventsTable = State.SQLite.table({
  name: 'goal_events',
  columns: {
    sequence: State.SQLite.integer({ primaryKey: true, autoIncrement: true }),
    id: State.SQLite.text({ nullable: false }),
    aggregate_id: State.SQLite.text({ nullable: false }),
    event_type: State.SQLite.text({ nullable: false }),
    payload_encrypted: State.SQLite.blob({
      schema: S.Uint8ArrayFromSelf,
      nullable: false,
    }),
    version: State.SQLite.integer({ nullable: false }),
    occurred_at: State.SQLite.integer({ nullable: false }),
  },
});

export const tables = {
  goal_events: goalEventsTable,
};

// We treat all domain events as a single generic "goal.event" with an encrypted payload.
// The payload schema is Uint8Array to keep ciphertext opaque to LiveStore.
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
  'goal.event': ({ id, aggregateId, eventType, payload, version, occurredAt }) =>
    tables.goal_events.insert({
      id,
      aggregate_id: aggregateId,
      event_type: eventType,
      payload_encrypted: payload,
      version,
      occurred_at: occurredAt,
    }),
});

const state = State.SQLite.makeState({
  tables,
  materializers,
});

export const schema = makeSchema({ state, events });
