export type Migration = {
  from: number;
  to: number;
  up: string[];
  down?: string[];
};

// Legacy migrations retained for wa-sqlite path; browser no longer relies on these tables.
export const migrations: Migration[] = [
  {
    from: 0,
    to: 1,
    up: [
      'CREATE TABLE goal_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, aggregate_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_encrypted BLOB NOT NULL, version INTEGER NOT NULL, occurred_at INTEGER NOT NULL);',
      'CREATE INDEX idx_goal_events_aggregate_version ON goal_events(aggregate_id, version);',
      'CREATE INDEX idx_goal_events_sequence ON goal_events(sequence);',
    ],
  },
];
