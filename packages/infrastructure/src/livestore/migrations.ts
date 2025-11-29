import { MigrationStep } from './types';
import { goalsSchema } from './schema';

// Placeholder migrations: starts at version 1
export const migrations: MigrationStep[] = [
  {
    from: 0,
    to: goalsSchema.version,
    up: [
      'CREATE TABLE goals (id TEXT PRIMARY KEY, slice TEXT, summary_encrypted BLOB, target_month TEXT, priority TEXT, created_by TEXT, created_at INTEGER, deleted_at INTEGER, version INTEGER);',
      'CREATE TABLE goal_access (id TEXT PRIMARY KEY, goal_id TEXT, user_id TEXT, permission TEXT, granted_at INTEGER, revoked_at INTEGER);',
      'CREATE TABLE goal_events (id TEXT PRIMARY KEY, aggregate_id TEXT, event_type TEXT, payload_encrypted BLOB, version INTEGER, occurred_at INTEGER, sequence INTEGER UNIQUE);',
      'CREATE INDEX idx_goals_deleted_at ON goals(deleted_at);',
      'CREATE INDEX idx_goal_access_goal_user ON goal_access(goal_id, user_id, revoked_at);',
      'CREATE INDEX idx_goal_events_aggregate_version ON goal_events(aggregate_id, version);',
      'CREATE INDEX idx_goal_events_sequence ON goal_events(sequence);',
    ],
  },
];
