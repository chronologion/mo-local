import { describe, expect, it } from 'vitest';
import {
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalDeleted,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
} from '@mo/domain';
import { applyGoalEvent } from './goalMaterializer';
import { createEmptyState } from './types';

const baseDate = new Date('2025-01-01T00:00:00Z');
const aggregateId = 'g-1';

const created = new GoalCreated({
  goalId: aggregateId,
  slice: 'Health',
  summary: 'Test',
  targetMonth: '2025-12',
  priority: 'must',
  createdBy: 'user-1',
  createdAt: baseDate,
});

describe('goalMaterializer', () => {
  it('materializes create and updates', () => {
    const state = createEmptyState();
    applyGoalEvent(state, created);
    applyGoalEvent(
      state,
      new GoalSummaryChanged({
        goalId: aggregateId,
        summary: 'Updated',
        changedAt: baseDate,
      })
    );
    applyGoalEvent(
      state,
      new GoalSliceChanged({ goalId: aggregateId, slice: 'Work', changedAt: baseDate })
    );
    applyGoalEvent(
      state,
      new GoalTargetChanged({
        goalId: aggregateId,
        targetMonth: '2026-01',
        changedAt: baseDate,
      })
    );
    applyGoalEvent(
      state,
      new GoalPriorityChanged({
        goalId: aggregateId,
        priority: 'should',
        changedAt: baseDate,
      })
    );

    const row = state.goals.get(aggregateId);
    expect(row).toBeDefined();
    expect(row?.summary).toBe('Updated');
    expect(row?.slice).toBe('Work');
    expect(row?.target_month).toBe('2026-01');
    expect(row?.priority).toBe('should');
    expect(row?.version).toBe(5);
  });

  it('handles delete', () => {
    const state = createEmptyState();
    applyGoalEvent(state, created);
    applyGoalEvent(state, new GoalDeleted({ goalId: aggregateId, deletedAt: baseDate }));
    const row = state.goals.get(aggregateId);
    expect(row?.deleted_at).not.toBeNull();
  });

  it('materializes access grant/revoke', () => {
    const state = createEmptyState();
    applyGoalEvent(state, created);
    applyGoalEvent(
      state,
      new GoalAccessGranted({
        goalId: aggregateId,
        grantedTo: 'user-2',
        permission: 'edit',
        grantedAt: baseDate,
      })
    );
    applyGoalEvent(
      state,
      new GoalAccessRevoked({
        goalId: aggregateId,
        revokedFrom: 'user-2',
        revokedAt: baseDate,
      })
    );

    const access = state.goalAccess.get('g-1:user-2');
    expect(access?.permission).toBe('edit');
    expect(access?.revoked_at).not.toBeNull();
  });
});
