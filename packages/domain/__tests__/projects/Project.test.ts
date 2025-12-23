import { describe, expect, it } from 'vitest';
import { Project } from '../../src/projects/Project';
import { ProjectId } from '../../src/projects/vos/ProjectId';
import { ProjectName } from '../../src/projects/vos/ProjectName';
import { ProjectStatus } from '../../src/projects/vos/ProjectStatus';
import { ProjectDescription } from '../../src/projects/vos/ProjectDescription';
import { MilestoneId } from '../../src/projects/vos/MilestoneId';
import { LocalDate } from '../../src/shared/vos/LocalDate';
import { GoalId } from '../../src/goals/vos/GoalId';
import { UserId } from '../../src/identity/UserId';
import { Timestamp } from '../../src/shared/vos/Timestamp';

const today = LocalDate.today();
const nextMonth = LocalDate.from(
  today.year,
  today.month,
  Math.min(today.day + 1, 28)
);
const createdAt = Timestamp.fromMillis(1_700_000_000_000);
const changedAt = Timestamp.fromMillis(1_700_000_000_500);
const laterAt = Timestamp.fromMillis(1_700_000_001_000);

describe('Project aggregate', () => {
  it('creates a project with required value objects and emits ProjectCreated', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('New Project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.from('A sample project'),
      createdBy: UserId.from('user-1'),
      createdAt,
    });

    expect(project.name.value).toBe('New Project');
    expect(project.status.equals(ProjectStatus.Planned)).toBe(true);
    expect(project.startDate.equals(today)).toBe(true);
    expect(project.targetDate.equals(nextMonth)).toBe(true);
    expect(project.description.value).toBe('A sample project');
    expect(project.milestones).toHaveLength(0);
    expect(project.createdAt.toISOString()).toBe(
      project.updatedAt.toISOString()
    );
    const events = project.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('ProjectCreated');
  });

  it('rejects creation when start date is after target date', () => {
    expect(() =>
      Project.create({
        id: ProjectId.create(),
        name: ProjectName.from('Invalid'),
        status: ProjectStatus.Planned,
        startDate: nextMonth,
        targetDate: today,
        description: ProjectDescription.empty(),
        createdBy: UserId.from('user-1'),
        createdAt,
      })
    ).toThrow(/Start date must be on or before target date/);
  });

  it('adds milestones within project date range', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Milestone project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-2'),
      createdAt,
    });

    const milestoneId = MilestoneId.create();
    project.addMilestone(
      {
        id: milestoneId,
        name: 'First milestone',
        targetDate: today,
      },
      changedAt
    );

    expect(project.milestones).toHaveLength(1);
    expect(project.milestones[0].id.equals(milestoneId)).toBe(true);
  });

  it('rejects milestones outside project date range', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Constrained project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: today,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-3'),
      createdAt,
    });

    expect(() =>
      project.addMilestone(
        {
          id: MilestoneId.create(),
          name: 'Bad milestone',
          targetDate: LocalDate.from(today.year + 1, today.month, today.day),
        },
        changedAt
      )
    ).toThrow(/Milestone target date must be within project dates/);
  });

  it('prevents changing project dates to exclude existing milestones', () => {
    const startDay = Math.min(today.day, 20);
    const startDate = LocalDate.from(today.year, today.month, startDay);
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Project with milestones'),
      status: ProjectStatus.InProgress,
      startDate,
      targetDate: LocalDate.from(today.year, today.month, startDay + 10),
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-4'),
      createdAt,
    });
    project.addMilestone(
      {
        id: MilestoneId.create(),
        name: 'Inside range',
        targetDate: LocalDate.from(today.year, today.month, startDay + 5),
      },
      changedAt
    );

    expect(() =>
      project.changeDates(
        {
          startDate,
          targetDate: LocalDate.from(today.year, today.month, startDay + 2),
        },
        laterAt
      )
    ).toThrow(/Existing milestones must remain within the new date range/);
  });

  it('links and unlinks a goal (max one goal)', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Linked project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-5'),
      createdAt,
    });

    const goalId = GoalId.create();
    project.addGoal(goalId, changedAt);
    expect(project.goalId?.equals(goalId)).toBe(true);

    expect(() => project.addGoal(GoalId.create(), laterAt)).toThrow(
      /Project already linked to a goal/
    );

    project.removeGoal(laterAt);
    expect(project.goalId).toBeNull();
  });

  it('prevents mutations after archival', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('To archive'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-6'),
      createdAt,
    });
    project.archive(changedAt);

    expect(project.isArchived).toBe(true);
    expect(() =>
      project.changeName(ProjectName.from('New name after archive'), laterAt)
    ).toThrow();
    expect(() =>
      project.addMilestone(
        {
          id: MilestoneId.create(),
          name: 'Should fail',
          targetDate: today,
        },
        laterAt
      )
    ).toThrow();
  });

  it('enforces allowed status transitions and updates updatedAt', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Lifecycle'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-7'),
      createdAt,
    });
    const initialUpdated = project.updatedAt;

    project.changeStatus(ProjectStatus.InProgress, changedAt);
    expect(project.status.equals(ProjectStatus.InProgress)).toBe(true);
    expect(
      project.updatedAt.isAfter(initialUpdated) ||
        project.updatedAt.equals(initialUpdated)
    ).toBe(true);

    expect(() => project.changeStatus(ProjectStatus.Planned, laterAt)).toThrow(
      /Invalid status transition/
    );
    expect(() =>
      project.changeStatus(ProjectStatus.InProgress, laterAt)
    ).toThrow(/ProjectStatus unchanged/);

    project.changeStatus(ProjectStatus.Canceled, laterAt);
    expect(project.status.equals(ProjectStatus.Canceled)).toBe(true);
  });

  it('sets archivedAt and updatedAt on archive', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.from('Deletable'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.from('user-8'),
      createdAt,
    });
    project.archive(changedAt);
    expect(project.archivedAt).not.toBeNull();
    expect(project.updatedAt.toISOString()).toBe(
      project.archivedAt?.toISOString()
    );
  });
});
