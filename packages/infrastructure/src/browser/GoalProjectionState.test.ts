import { describe, expect, it } from 'vitest';
import {
  applyEventToSnapshot,
  buildAnalyticsDeltas,
  GoalSnapshotState,
  snapshotToListItem,
} from './GoalProjectionState';
import {
  GoalCreated,
  GoalDeleted,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
  GoalPriorityChanged,
  GoalAccessGranted,
} from '@mo/domain';

const baseDate = new Date('2025-01-01T00:00:00Z');
const aggregateId = 'goal-1';

const createdEvent = new GoalCreated({
  goalId: aggregateId,
  slice: 'Health',
  summary: 'Run a marathon',
  targetMonth: '2025-12',
  priority: 'must',
  createdBy: 'user-1',
  createdAt: baseDate,
});

describe('GoalProjectionState', () => {
  it('creates and updates a snapshot from events', () => {
    const created = applyEventToSnapshot(null, createdEvent, 1);
    expect(created).toMatchObject({
      id: aggregateId,
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      deletedAt: null,
      version: 1,
    });

    const updated = applyEventToSnapshot(
      created,
      new GoalSummaryChanged({
        goalId: aggregateId,
        summary: 'Run a half-marathon first',
        changedAt: baseDate,
      }),
      2
    );
    expect(updated?.summary).toBe('Run a half-marathon first');
    expect(updated?.version).toBe(2);

    const movedSlice = applyEventToSnapshot(
      updated,
      new GoalSliceChanged({
        goalId: aggregateId,
        slice: 'Leisure',
        changedAt: baseDate,
      }),
      3
    );
    expect(movedSlice?.slice).toBe('Leisure');
    expect(movedSlice?.version).toBe(3);

    const retargeted = applyEventToSnapshot(
      movedSlice,
      new GoalTargetChanged({
        goalId: aggregateId,
        targetMonth: '2026-01',
        changedAt: baseDate,
      }),
      4
    );
    expect(retargeted?.targetMonth).toBe('2026-01');
    expect(retargeted?.version).toBe(4);

    const reprioritized = applyEventToSnapshot(
      retargeted,
      new GoalPriorityChanged({
        goalId: aggregateId,
        priority: 'should',
        changedAt: baseDate,
      }),
      5
    );
    expect(reprioritized?.priority).toBe('should');
    expect(reprioritized?.version).toBe(5);

    const deleted = applyEventToSnapshot(
      reprioritized,
      new GoalDeleted({ goalId: aggregateId, deletedAt: baseDate }),
      6
    );
    expect(deleted?.deletedAt).toBe(baseDate.getTime());
    expect(deleted?.version).toBe(6);
  });

  it('ignores access events for snapshot payload but advances version', () => {
    const created = applyEventToSnapshot(
      null,
      createdEvent,
      1
    ) as GoalSnapshotState;
    const afterAccess = applyEventToSnapshot(
      created,
      new GoalAccessGranted({
        goalId: aggregateId,
        grantedTo: 'user-2',
        permission: 'edit',
        grantedAt: baseDate,
      }),
      2
    );
    expect(afterAccess?.version).toBe(2);
    expect(afterAccess?.summary).toBe(created.summary);
  });

  it('builds analytics deltas when slice/month change', () => {
    const created = applyEventToSnapshot(
      null,
      createdEvent,
      1
    ) as GoalSnapshotState;
    const moved = { ...created, slice: 'Work', targetMonth: '2026-02' };

    const deltas = buildAnalyticsDeltas(created, moved);
    expect(deltas.monthly).toEqual([
      { yearMonth: '2025-12', slice: 'Health', delta: -1 },
      { yearMonth: '2026-02', slice: 'Work', delta: 1 },
    ]);
    expect(deltas.category).toEqual([
      { year: 2025, slice: 'Health', delta: -1 },
      { year: 2026, slice: 'Work', delta: 1 },
    ]);
  });

  it('produces a list item DTO from snapshot', () => {
    const created = applyEventToSnapshot(
      null,
      createdEvent,
      1
    ) as GoalSnapshotState;
    const dto = snapshotToListItem(created);
    expect(dto).toMatchObject({
      id: aggregateId,
      summary: 'Run a marathon',
      slice: 'Health',
      priority: 'must',
      targetMonth: '2025-12',
      createdAt: created.createdAt,
      deletedAt: null,
    });
  });
});
