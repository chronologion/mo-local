import { describe, expect, it } from 'vitest';
import {
  LocalDate,
  GoalId,
  MilestoneId,
  MilestoneName,
  ProjectArchived,
  ProjectCreated,
  ProjectDescription,
  ProjectDescribed,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectId,
  ProjectMilestoneAdded,
  ProjectMilestoneArchived,
  ProjectMilestoneRenamed,
  ProjectMilestoneRescheduled,
  ProjectName,
  ProjectRenamed,
  ProjectRescheduled,
  ProjectStatus,
  ProjectStatusTransitioned,
  Timestamp,
  UserId,
  ActorId,
  EventId,
} from '@mo/domain';
import { applyProjectEventToSnapshot } from '../../../src/projects/projections/model/ProjectProjectionState';

const baseProjectId = ProjectId.from('00000000-0000-0000-0000-000000000201');
const milestoneId = MilestoneId.from('00000000-0000-0000-0000-000000000301');
const meta = (occurredAt: Timestamp, aggregateId: ProjectId = baseProjectId) => ({
  aggregateId,
  occurredAt,
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

const createdEvent = () =>
  new ProjectCreated(
    {
      projectId: baseProjectId,
      name: ProjectName.from('Project One'),
      status: ProjectStatus.from('planned'),
      startDate: LocalDate.fromString('2025-01-01'),
      targetDate: LocalDate.fromString('2025-06-01'),
      description: ProjectDescription.from('Initial'),
      goalId: null,
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1000),
    },
    meta(Timestamp.fromMillis(1000))
  );

describe('ProjectProjectionState.applyProjectEventToSnapshot', () => {
  it('applies ProjectCreated', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    expect(snapshot).toEqual({
      id: baseProjectId.value,
      name: 'Project One',
      status: 'planned',
      startDate: '2025-01-01',
      targetDate: '2025-06-01',
      description: 'Initial',
      goalId: null,
      milestones: [],
      createdBy: 'user-1',
      createdAt: 1000,
      updatedAt: 1000,
      archivedAt: null,
      version: 1,
    });
  });

  it('updates status', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const next = applyProjectEventToSnapshot(
      snapshot,
      new ProjectStatusTransitioned(
        {
          projectId: baseProjectId,
          status: ProjectStatus.from('in_progress'),
          changedAt: Timestamp.fromMillis(2000),
        },
        meta(Timestamp.fromMillis(2000))
      ),
      2
    );
    expect(next?.status).toBe('in_progress');
    expect(next?.updatedAt).toBe(2000);
    expect(next?.version).toBe(2);
  });

  it('updates dates', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const next = applyProjectEventToSnapshot(
      snapshot,
      new ProjectRescheduled(
        {
          projectId: baseProjectId,
          startDate: LocalDate.fromString('2025-02-01'),
          targetDate: LocalDate.fromString('2025-07-01'),
          changedAt: Timestamp.fromMillis(3000),
        },
        meta(Timestamp.fromMillis(3000))
      ),
      2
    );
    expect(next?.startDate).toBe('2025-02-01');
    expect(next?.targetDate).toBe('2025-07-01');
    expect(next?.updatedAt).toBe(3000);
  });

  it('updates name and description', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const renamed = applyProjectEventToSnapshot(
      snapshot,
      new ProjectRenamed(
        {
          projectId: baseProjectId,
          name: ProjectName.from('Project Two'),
          changedAt: Timestamp.fromMillis(4000),
        },
        meta(Timestamp.fromMillis(4000))
      ),
      2
    );
    expect(renamed?.name).toBe('Project Two');
    expect(renamed?.updatedAt).toBe(4000);

    const described = applyProjectEventToSnapshot(
      renamed,
      new ProjectDescribed(
        {
          projectId: baseProjectId,
          description: ProjectDescription.from('Updated'),
          changedAt: Timestamp.fromMillis(5000),
        },
        meta(Timestamp.fromMillis(5000))
      ),
      3
    );
    expect(described?.description).toBe('Updated');
    expect(described?.updatedAt).toBe(5000);
  });

  it('adds and removes goal links', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const linked = applyProjectEventToSnapshot(
      snapshot,
      new ProjectGoalAdded(
        {
          projectId: baseProjectId,
          goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
          addedAt: Timestamp.fromMillis(6000),
        },
        meta(Timestamp.fromMillis(6000))
      ),
      2
    );
    expect(linked?.goalId).toBe('00000000-0000-0000-0000-000000000101');

    const unlinked = applyProjectEventToSnapshot(
      linked,
      new ProjectGoalRemoved(
        {
          projectId: baseProjectId,
          removedAt: Timestamp.fromMillis(7000),
        },
        meta(Timestamp.fromMillis(7000))
      ),
      3
    );
    expect(unlinked?.goalId).toBeNull();
  });

  it('manages milestones', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const added = applyProjectEventToSnapshot(
      snapshot,
      new ProjectMilestoneAdded(
        {
          projectId: baseProjectId,
          milestoneId,
          name: MilestoneName.from('M1'),
          targetDate: LocalDate.fromString('2025-03-01'),
          addedAt: Timestamp.fromMillis(8000),
        },
        meta(Timestamp.fromMillis(8000))
      ),
      2
    );
    expect(added?.milestones).toHaveLength(1);
    expect(added?.milestones[0]).toEqual({
      id: milestoneId.value,
      name: 'M1',
      targetDate: '2025-03-01',
    });

    const renamed = applyProjectEventToSnapshot(
      added,
      new ProjectMilestoneRenamed(
        {
          projectId: baseProjectId,
          milestoneId,
          name: MilestoneName.from('M2'),
          changedAt: Timestamp.fromMillis(9000),
        },
        meta(Timestamp.fromMillis(9000))
      ),
      3
    );
    expect(renamed?.milestones[0]?.name).toBe('M2');

    const rescheduled = applyProjectEventToSnapshot(
      renamed,
      new ProjectMilestoneRescheduled(
        {
          projectId: baseProjectId,
          milestoneId,
          targetDate: LocalDate.fromString('2025-04-01'),
          changedAt: Timestamp.fromMillis(10000),
        },
        meta(Timestamp.fromMillis(10000))
      ),
      4
    );
    expect(rescheduled?.milestones[0]?.targetDate).toBe('2025-04-01');

    const archived = applyProjectEventToSnapshot(
      rescheduled,
      new ProjectMilestoneArchived(
        {
          projectId: baseProjectId,
          milestoneId,
          archivedAt: Timestamp.fromMillis(11000),
        },
        meta(Timestamp.fromMillis(11000))
      ),
      5
    );
    expect(archived?.milestones).toHaveLength(0);
  });

  it('archives project', () => {
    const snapshot = applyProjectEventToSnapshot(null, createdEvent(), 1);
    const archived = applyProjectEventToSnapshot(
      snapshot,
      new ProjectArchived(
        {
          projectId: baseProjectId,
          archivedAt: Timestamp.fromMillis(12000),
        },
        meta(Timestamp.fromMillis(12000))
      ),
      2
    );
    expect(archived?.archivedAt).toBe(12000);
    expect(archived?.updatedAt).toBe(12000);
  });
});
