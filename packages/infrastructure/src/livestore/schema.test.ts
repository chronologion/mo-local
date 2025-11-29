import { describe, expect, it } from 'vitest';
import { goalsSchema } from './schema';

describe('goalsSchema', () => {
  it('includes required tables and columns', () => {
    const { tables } = goalsSchema;
    expect(Object.keys(tables)).toEqual(['goals', 'goal_access', 'goal_events']);
    expect(tables.goals.columns.id.primaryKey).toBe(true);
    expect(tables.goal_events.columns.sequence.autoIncrement).toBe(true);
  });

  it('defines indexes for performance', () => {
    const indexNames = goalsSchema.indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_goal_events_sequence');
    expect(indexNames).toContain('idx_goal_access_goal_user');
    expect(indexNames).toContain('idx_goals_created_by');
    expect(indexNames).toContain('idx_goals_target_month');
  });
});
