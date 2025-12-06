import { describe, expect, it } from 'vitest';
import { validateCreateGoalCommand } from './CreateGoalCommand';
import { validateChangeGoalSummaryCommand } from './ChangeGoalSummaryCommand';
import { validateGrantGoalAccessCommand } from './GrantGoalAccessCommand';

const now = Date.now();

describe('CreateGoalCommand validation', () => {
  it('validates a correct command', () => {
    const result = validateCreateGoalCommand({
      type: 'CreateGoal',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001',
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.goalId.value).toBe(
        '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001'
      );
      expect(result.value.slice.value).toBe('Health');
      expect(result.value.priority.level).toBe('must');
    }
  });

  it('accumulates validation errors', () => {
    const result = validateCreateGoalCommand({
      type: 'CreateGoal',
      goalId: 'not-a-uuid',
      slice: 'BadSlice' as never,
      summary: '',
      targetMonth: 'bad',
      priority: 'must',
      userId: '',
      timestamp: Number.NaN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('goalId');
      expect(fields).toContain('slice');
      expect(fields).toContain('summary');
      expect(fields).toContain('targetMonth');
      expect(fields).toContain('userId');
      expect(fields).toContain('timestamp');
    }
  });
});

describe('ChangeGoalSummaryCommand validation', () => {
  it('requires non-empty summary', () => {
    const result = validateChangeGoalSummaryCommand({
      type: 'ChangeGoalSummary',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f002',
      summary: '',
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'summary')).toBe(true);
    }
  });
});

describe('GrantGoalAccessCommand validation', () => {
  it('rejects invalid permission', () => {
    const result = validateGrantGoalAccessCommand({
      type: 'GrantGoalAccess',
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f003',
      grantToUserId: 'user-2',
      permission: 'owner' as never,
      userId: 'user-1',
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'permission')).toBe(true);
    }
  });
});
