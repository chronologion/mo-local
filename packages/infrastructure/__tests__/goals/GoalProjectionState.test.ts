import { describe, expect, it } from 'vitest';
import {
  applyEventToSnapshot,
  buildAnalyticsDeltas,
  GoalSnapshotState,
  snapshotToListItem,
} from '../../src/goals/projections/model/GoalProjectionState';
import {
  ActorId,
  GoalCreated,
  GoalArchived,
  GoalRecategorized,
  GoalRefined,
  GoalRescheduled,
  GoalPrioritized,
  GoalAchieved,
  GoalAccessGranted,
  GoalId,
  Slice,
  Summary,
  Month,
  Priority,
  UserId,
  Timestamp,
  Permission,
  EventId,
} from '@mo/domain';

const baseDate = Timestamp.fromMillis(
  new Date('2025-01-01T00:00:00Z').getTime()
);
const aggregateId = GoalId.from('00000000-0000-0000-0000-000000000001');
const meta = () => ({
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

const createdEvent = new GoalCreated(
  {
    goalId: aggregateId,
    slice: Slice.from('Health'),
    summary: Summary.from('Run a marathon'),
    targetMonth: Month.from('2025-12'),
    priority: Priority.from('must'),
    createdBy: UserId.from('user-1'),
    createdAt: baseDate,
  },
  meta()
);

describe('GoalProjectionState', () => {
  it('creates and updates a snapshot from events', () => {
    const created = applyEventToSnapshot(null, createdEvent, 1);
    expect(created).toMatchObject({
      id: aggregateId.value,
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      achievedAt: null,
      archivedAt: null,
      version: 1,
    });

    const updated = applyEventToSnapshot(
      created,
      new GoalRefined(
        {
          goalId: aggregateId,
          summary: Summary.from('Run a half-marathon first'),
          changedAt: baseDate,
        },
        meta()
      ),
      2
    );
    expect(updated?.summary).toBe('Run a half-marathon first');
    expect(updated?.version).toBe(2);

    const movedSlice = applyEventToSnapshot(
      updated,
      new GoalRecategorized(
        {
          goalId: aggregateId,
          slice: Slice.from('Leisure'),
          changedAt: baseDate,
        },
        meta()
      ),
      3
    );
    expect(movedSlice?.slice).toBe('Leisure');
    expect(movedSlice?.version).toBe(3);

    const retargeted = applyEventToSnapshot(
      movedSlice,
      new GoalRescheduled(
        {
          goalId: aggregateId,
          targetMonth: Month.from('2026-01'),
          changedAt: baseDate,
        },
        meta()
      ),
      4
    );
    expect(retargeted?.targetMonth).toBe('2026-01');
    expect(retargeted?.version).toBe(4);

    const reprioritized = applyEventToSnapshot(
      retargeted,
      new GoalPrioritized(
        {
          goalId: aggregateId,
          priority: Priority.from('should'),
          changedAt: baseDate,
        },
        meta()
      ),
      5
    );
    expect(reprioritized?.priority).toBe('should');
    expect(reprioritized?.version).toBe(5);

    const achieved = applyEventToSnapshot(
      reprioritized,
      new GoalAchieved({ goalId: aggregateId, achievedAt: baseDate }, meta()),
      6
    );
    expect(achieved?.achievedAt).toBe(baseDate.value);

    const archived = applyEventToSnapshot(
      achieved,
      new GoalArchived({ goalId: aggregateId, archivedAt: baseDate }, meta()),
      7
    );
    expect(archived?.archivedAt).toBe(baseDate.value);
    expect(archived?.version).toBe(7);
  });

  it('ignores access events for snapshot payload but advances version', () => {
    const created = applyEventToSnapshot(
      null,
      createdEvent,
      1
    ) as GoalSnapshotState;
    const afterAccess = applyEventToSnapshot(
      created,
      new GoalAccessGranted(
        {
          goalId: aggregateId,
          grantedTo: UserId.from('user-2'),
          permission: Permission.from('edit'),
          grantedAt: baseDate,
        },
        meta()
      ),
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
      id: aggregateId.value,
      summary: 'Run a marathon',
      slice: 'Health',
      priority: 'must',
      targetMonth: '2025-12',
      createdAt: created.createdAt,
      achievedAt: null,
      archivedAt: null,
    });
  });

  it('sets achievedAt when goal is achieved', () => {
    const created = applyEventToSnapshot(
      null,
      createdEvent,
      1
    ) as GoalSnapshotState;
    const achieved = applyEventToSnapshot(
      created,
      new GoalAchieved({ goalId: aggregateId, achievedAt: baseDate }, meta()),
      2
    );
    expect(achieved?.achievedAt).toBe(baseDate.value);
  });
});
