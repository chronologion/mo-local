import { MigrationStep } from './types';
import { goalsSchema } from './schema';

// Placeholder migrations: starts at version 1
export const migrations: MigrationStep[] = [
  {
    from: 0,
    to: goalsSchema.version,
    up: [
      'CREATE TABLE goals (id TEXT PRIMARY KEY, slice TEXT NOT NULL, summary_encrypted BLOB NOT NULL, target_month TEXT NOT NULL, priority TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER, version INTEGER NOT NULL);',
      'CREATE TABLE goal_access (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, user_id TEXT NOT NULL, permission TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_at INTEGER);',
      'CREATE TABLE goal_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, aggregate_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_encrypted BLOB NOT NULL, version INTEGER NOT NULL, occurred_at INTEGER NOT NULL);',
      'CREATE INDEX idx_goals_deleted_at ON goals(deleted_at);',
      'CREATE INDEX idx_goals_created_by ON goals(created_by);',
      'CREATE INDEX idx_goals_target_month ON goals(target_month);',
      'CREATE INDEX idx_goal_access_goal_user ON goal_access(goal_id, user_id, revoked_at);',
      'CREATE INDEX idx_goal_events_aggregate_version ON goal_events(aggregate_id, version);',
      'CREATE INDEX idx_goal_events_sequence ON goal_events(sequence);',
    ],
  },
];
