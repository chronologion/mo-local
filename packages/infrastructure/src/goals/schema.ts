import { Events, makeSchema, State } from '@livestore/livestore';
import * as S from 'effect/Schema';
import { goalEventTypes, projectEventTypes } from '@mo/domain';

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
    epoch: State.SQLite.integer({ nullable: true }),
    keyring_update: State.SQLite.blob({ nullable: true }),
    version: State.SQLite.integer({ nullable: false }),
    occurred_at: State.SQLite.integer({ nullable: false }),
    actor_id: State.SQLite.text({ nullable: true }),
    causation_id: State.SQLite.text({ nullable: true }),
    correlation_id: State.SQLite.text({ nullable: true }),
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

const goalSearchIndexTable = State.SQLite.table({
  name: 'goal_search_index',
  columns: {
    key: State.SQLite.text({ nullable: false, primaryKey: true }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    last_sequence: State.SQLite.integer({ nullable: false }),
    updated_at: State.SQLite.integer({ nullable: false }),
  },
});

const projectEventsTable = State.SQLite.table({
  name: 'project_events',
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
    epoch: State.SQLite.integer({ nullable: true }),
    keyring_update: State.SQLite.blob({ nullable: true }),
    version: State.SQLite.integer({ nullable: false }),
    occurred_at: State.SQLite.integer({ nullable: false }),
    actor_id: State.SQLite.text({ nullable: true }),
    causation_id: State.SQLite.text({ nullable: true }),
    correlation_id: State.SQLite.text({ nullable: true }),
  },
});

const projectSnapshotsTable = State.SQLite.table({
  name: 'project_snapshots',
  columns: {
    aggregate_id: State.SQLite.text({ nullable: false, primaryKey: true }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    version: State.SQLite.integer({ nullable: false }),
    last_sequence: State.SQLite.integer({ nullable: false }),
    updated_at: State.SQLite.integer({ nullable: false }),
  },
});

const projectProjectionMetaTable = State.SQLite.table({
  name: 'project_projection_meta',
  columns: {
    key: State.SQLite.text({ nullable: false, primaryKey: true }),
    value: State.SQLite.text({ nullable: false }),
  },
});

const projectSearchIndexTable = State.SQLite.table({
  name: 'project_search_index',
  columns: {
    key: State.SQLite.text({ nullable: false, primaryKey: true }),
    payload_encrypted: State.SQLite.blob({ nullable: false }),
    last_sequence: State.SQLite.integer({ nullable: false }),
    updated_at: State.SQLite.integer({ nullable: false }),
  },
});

const goalAchievementStateTable = State.SQLite.table({
  name: 'goal_achievement_state',
  columns: {
    goal_id: State.SQLite.text({ nullable: false, primaryKey: true }),
    linked_project_ids: State.SQLite.text({ nullable: false }),
    completed_project_ids: State.SQLite.text({ nullable: false }),
    achieved: State.SQLite.integer({ nullable: false }),
    achievement_requested: State.SQLite.integer({ nullable: false }),
  },
});

const goalAchievementProjectsTable = State.SQLite.table({
  name: 'goal_achievement_projects',
  columns: {
    project_id: State.SQLite.text({ nullable: false, primaryKey: true }),
    goal_id: State.SQLite.text({ nullable: true }),
    status: State.SQLite.text({ nullable: true }),
  },
});

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
  goal_events: goalEventsTable,
  goal_snapshots: goalSnapshotsTable,
  goal_projection_meta: goalProjectionMetaTable,
  goal_analytics: goalAnalyticsTable,
  goal_search_index: goalSearchIndexTable,
  project_events: projectEventsTable,
  project_snapshots: projectSnapshotsTable,
  project_projection_meta: projectProjectionMetaTable,
  project_search_index: projectSearchIndexTable,
  goal_achievement_state: goalAchievementStateTable,
  goal_achievement_projects: goalAchievementProjectsTable,
  idempotency_keys: idempotencyKeysTable,
};

type GoalEventPayload = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  epoch?: number;
  keyringUpdate?: unknown;
  version: number;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
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

const goalEventNames = new Set(Object.values(goalEventTypes) as string[]);
const projectEventNames = new Set(Object.values(projectEventTypes) as string[]);

const materializers = State.SQLite.materializers(events, {
  'event.v1': ({
    id,
    aggregateId,
    eventType,
    payload,
    epoch,
    keyringUpdate,
    version,
    occurredAt,
    actorId,
    causationId,
    correlationId,
  }: GoalEventPayload) => {
    try {
      const payloadBytes = asUint8Array(payload) as Uint8Array<ArrayBuffer>;
      const keyringBytes = keyringUpdate
        ? (asUint8Array(keyringUpdate) as Uint8Array<ArrayBuffer>)
        : null;

      if (goalEventNames.has(eventType)) {
        return [
          tables.goal_events.insert({
            id,
            aggregate_id: aggregateId,
            event_type: eventType,
            payload_encrypted: payloadBytes,
            epoch: epoch ?? null,
            keyring_update: keyringBytes,
            version,
            occurred_at: occurredAt,
            actor_id: actorId,
            causation_id: causationId,
            correlation_id: correlationId,
          }),
        ];
      }

      if (projectEventNames.has(eventType)) {
        return [
          tables.project_events.insert({
            id,
            aggregate_id: aggregateId,
            event_type: eventType,
            payload_encrypted: payloadBytes,
            epoch: epoch ?? null,
            keyring_update: keyringBytes,
            version,
            occurred_at: occurredAt,
            actor_id: actorId,
            causation_id: causationId,
            correlation_id: correlationId,
          }),
        ];
      }

      console.warn('[event.v1 materializer] unknown event type', {
        id,
        aggregateId,
        eventType,
        version,
        occurredAt,
      });
      return [];
    } catch (error) {
      console.error('[event.v1 materializer] failed to normalize payload', {
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
