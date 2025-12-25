import { describe, expect, it } from 'vitest';
import {
  ActorId,
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalArchived,
  GoalCreated,
  GoalId,
  GoalPrioritized,
  GoalRecategorized,
  GoalRefined,
  GoalRescheduled,
  GoalAchieved,
  GoalUnachieved,
  LocalDate,
  Month,
  Permission,
  Priority,
  ProjectArchived,
  ProjectCreated,
  ProjectRescheduled,
  ProjectDescription,
  ProjectDescribed,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectId,
  ProjectMilestoneAdded,
  ProjectMilestoneArchived,
  ProjectMilestoneRenamed,
  ProjectMilestoneRescheduled,
  MilestoneName,
  ProjectName,
  ProjectRenamed,
  ProjectStatus,
  ProjectStatusTransitioned,
  Slice,
  Summary,
  Timestamp,
  UserId,
  MilestoneId,
  goalEventTypes,
  EventId,
} from '@mo/domain';
import { decodePersisted, encodePersisted } from '../../src/eventing/registry';
import { upcastPayload } from '../../src/eventing/upcast';

const ts = (iso: string) => Timestamp.fromMillis(new Date(iso).getTime());

describe('eventing registry + runtime', () => {
  it('round-trips all event specs', () => {
    const goalId = GoalId.from('00000000-0000-0000-0000-000000000101');
    const projectId = ProjectId.from('00000000-0000-0000-0000-000000000201');
    const milestoneId = MilestoneId.from(
      '00000000-0000-0000-0000-000000000301'
    );
    const userId = UserId.from('user-1');

    const actorId = ActorId.from('user-1');
    const meta = () => ({ eventId: EventId.create(), actorId });
    const events = [
      new GoalCreated(
        {
          goalId,
          slice: Slice.from('Health'),
          summary: Summary.from('Goal created'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: userId,
          createdAt: ts('2025-01-01T00:00:00Z'),
        },
        meta()
      ),
      new GoalRefined(
        {
          goalId,
          summary: Summary.from('Updated summary'),
          changedAt: ts('2025-01-02T00:00:00Z'),
        },
        meta()
      ),
      new GoalRecategorized(
        {
          goalId,
          slice: Slice.from('Work'),
          changedAt: ts('2025-01-03T00:00:00Z'),
        },
        meta()
      ),
      new GoalRescheduled(
        {
          goalId,
          targetMonth: Month.from('2026-01'),
          changedAt: ts('2025-01-04T00:00:00Z'),
        },
        meta()
      ),
      new GoalPrioritized(
        {
          goalId,
          priority: Priority.from('should'),
          changedAt: ts('2025-01-05T00:00:00Z'),
        },
        meta()
      ),
      new GoalAchieved(
        {
          goalId,
          achievedAt: ts('2025-01-06T00:00:00Z'),
        },
        meta()
      ),
      new GoalUnachieved(
        {
          goalId,
          unachievedAt: ts('2025-01-06T12:00:00Z'),
        },
        meta()
      ),
      new GoalArchived(
        {
          goalId,
          archivedAt: ts('2025-01-07T00:00:00Z'),
        },
        meta()
      ),
      new GoalAccessGranted(
        {
          goalId,
          grantedTo: UserId.from('user-2'),
          permission: Permission.from('edit'),
          grantedAt: ts('2025-01-08T00:00:00Z'),
        },
        meta()
      ),
      new GoalAccessRevoked(
        {
          goalId,
          revokedFrom: UserId.from('user-2'),
          revokedAt: ts('2025-01-09T00:00:00Z'),
        },
        meta()
      ),
      new ProjectCreated(
        {
          projectId,
          name: ProjectName.from('Project Phoenix'),
          status: ProjectStatus.from('planned'),
          startDate: LocalDate.fromString('2025-01-01'),
          targetDate: LocalDate.fromString('2025-06-01'),
          description: ProjectDescription.from('Rebuild platform'),
          goalId: null,
          createdBy: userId,
          createdAt: ts('2025-01-09T00:00:00Z'),
        },
        meta()
      ),
      new ProjectStatusTransitioned(
        {
          projectId,
          status: ProjectStatus.from('in_progress'),
          changedAt: ts('2025-01-10T00:00:00Z'),
        },
        meta()
      ),
      new ProjectRescheduled(
        {
          projectId,
          startDate: LocalDate.fromString('2025-02-01'),
          targetDate: LocalDate.fromString('2025-07-01'),
          changedAt: ts('2025-01-11T00:00:00Z'),
        },
        meta()
      ),
      new ProjectRenamed(
        {
          projectId,
          name: ProjectName.from('Project Helios'),
          changedAt: ts('2025-01-12T00:00:00Z'),
        },
        meta()
      ),
      new ProjectDescribed(
        {
          projectId,
          description: ProjectDescription.from('New description'),
          changedAt: ts('2025-01-13T00:00:00Z'),
        },
        meta()
      ),
      new ProjectGoalAdded(
        {
          projectId,
          goalId,
          addedAt: ts('2025-01-14T00:00:00Z'),
        },
        meta()
      ),
      new ProjectGoalRemoved(
        {
          projectId,
          removedAt: ts('2025-01-15T00:00:00Z'),
        },
        meta()
      ),
      new ProjectMilestoneAdded(
        {
          projectId,
          milestoneId,
          name: MilestoneName.from('Milestone A'),
          targetDate: LocalDate.fromString('2025-03-01'),
          addedAt: ts('2025-01-16T00:00:00Z'),
        },
        meta()
      ),
      new ProjectMilestoneRescheduled(
        {
          projectId,
          milestoneId,
          targetDate: LocalDate.fromString('2025-04-01'),
          changedAt: ts('2025-01-17T00:00:00Z'),
        },
        meta()
      ),
      new ProjectMilestoneRenamed(
        {
          projectId,
          milestoneId,
          name: MilestoneName.from('Milestone B'),
          changedAt: ts('2025-01-18T00:00:00Z'),
        },
        meta()
      ),
      new ProjectMilestoneArchived(
        {
          projectId,
          milestoneId,
          archivedAt: ts('2025-01-19T00:00:00Z'),
        },
        meta()
      ),
      new ProjectArchived(
        {
          projectId,
          archivedAt: ts('2025-01-20T00:00:00Z'),
        },
        meta()
      ),
    ];

    for (const event of events) {
      const encoded = encodePersisted(event);
      const decoded = decodePersisted(encoded, meta());
      const reencoded = encodePersisted(decoded);
      expect(reencoded).toEqual(encoded);
    }
  });

  it('upcasts payloads when version matches latest', () => {
    const payload = { ok: true };
    const result = upcastPayload(goalEventTypes.goalCreated, 1, payload);
    expect(result).toEqual(payload);
  });

  it('throws on future payload versions', () => {
    expect(() => upcastPayload(goalEventTypes.goalCreated, 2, {})).toThrow(
      /future version/
    );
  });

  it('throws on missing migration steps', () => {
    expect(() => upcastPayload(goalEventTypes.goalCreated, 0, {})).toThrow(
      /missing migration/
    );
  });
});
