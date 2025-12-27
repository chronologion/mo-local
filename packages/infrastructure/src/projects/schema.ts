import { State } from '@livestore/livestore';
import { projectEventTypes } from '@mo/domain';
import type { DomainEventPayload } from '../livestore/types';

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

export const projectTables = {
  project_events: projectEventsTable,
  project_snapshots: projectSnapshotsTable,
  project_projection_meta: projectProjectionMetaTable,
  project_search_index: projectSearchIndexTable,
};

const projectEventNames = new Set(Object.values(projectEventTypes) as string[]);

export const materializeProjectEvent = (
  payload: DomainEventPayload,
  payloadBytes: Uint8Array<ArrayBuffer>,
  keyringBytes: Uint8Array<ArrayBuffer> | null
) => {
  if (!projectEventNames.has(payload.eventType)) {
    return [];
  }

  return [
    projectTables.project_events.insert({
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
