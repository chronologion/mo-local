import { SchemaDefinition } from './types';

export const goalsSchema: SchemaDefinition = {
  version: 1,
  tables: {
    goals: {
      name: 'goals',
      columns: {
        id: { type: 'text', primaryKey: true },
        slice: { type: 'text' },
        summary_encrypted: { type: 'blob' },
        target_month: { type: 'text' },
        priority: { type: 'text' },
        created_by: { type: 'text' },
        created_at: { type: 'integer' },
        deleted_at: { type: 'integer', nullable: true },
        version: { type: 'integer' },
      },
    },
    goal_access: {
      name: 'goal_access',
      columns: {
        id: { type: 'text', primaryKey: true },
        goal_id: { type: 'text' },
        user_id: { type: 'text' },
        permission: { type: 'text' },
        granted_at: { type: 'integer' },
        revoked_at: { type: 'integer', nullable: true },
      },
    },
    goal_events: {
      name: 'goal_events',
      columns: {
        id: { type: 'text', unique: true },
        aggregate_id: { type: 'text' },
        event_type: { type: 'text' },
        payload_encrypted: { type: 'blob' },
        version: { type: 'integer' },
        occurred_at: { type: 'integer' },
        sequence: {
          type: 'integer',
          autoIncrement: true,
          primaryKey: true,
        },
      },
    },
  },
  indexes: [
    { name: 'idx_goals_deleted_at', table: 'goals', columns: ['deleted_at'] },
    { name: 'idx_goals_created_by', table: 'goals', columns: ['created_by'] },
    {
      name: 'idx_goals_target_month',
      table: 'goals',
      columns: ['target_month'],
    },
    {
      name: 'idx_goal_access_goal_user',
      table: 'goal_access',
      columns: ['goal_id', 'user_id', 'revoked_at'],
    },
    {
      name: 'idx_goal_events_aggregate_version',
      table: 'goal_events',
      columns: ['aggregate_id', 'version'],
    },
    {
      name: 'idx_goal_events_sequence',
      table: 'goal_events',
      columns: ['sequence'],
    },
  ],
};
