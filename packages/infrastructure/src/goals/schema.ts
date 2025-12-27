import { State } from '@livestore/livestore';
import { goalEventTypes } from '@mo/domain';
import type { DomainEventPayload } from '../livestore/types';

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

export const goalTables = {
  goal_events: goalEventsTable,
  goal_snapshots: goalSnapshotsTable,
  goal_projection_meta: goalProjectionMetaTable,
  goal_analytics: goalAnalyticsTable,
  goal_search_index: goalSearchIndexTable,
  goal_achievement_state: goalAchievementStateTable,
  goal_achievement_projects: goalAchievementProjectsTable,
};

const goalEventNames = new Set(Object.values(goalEventTypes) as string[]);

export const materializeGoalEvent = (
  payload: DomainEventPayload,
  payloadBytes: Uint8Array<ArrayBuffer>,
  keyringBytes: Uint8Array<ArrayBuffer> | null
) => {
  if (!goalEventNames.has(payload.eventType)) {
    return [];
  }

  return [
    goalTables.goal_events.insert({
      id: payload.id,
      aggregate_id: payload.aggregateId,
      event_type: payload.eventType,
      payload_encrypted: payloadBytes,
      epoch: payload.epoch ?? null,
      keyring_update: keyringBytes,
      version: payload.version,
      occurred_at: payload.occurredAt,
      actor_id: payload.actorId,
      causation_id: payload.causationId,
      correlation_id: payload.correlationId,
    }),
  ];
};
