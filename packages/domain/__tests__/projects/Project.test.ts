import { describe, expect, it } from 'vitest';
import { Project } from '../../src/projects/Project';
import { ProjectId } from '../../src/projects/ProjectId';
import { ProjectName } from '../../src/projects/ProjectName';
import { ProjectStatus } from '../../src/projects/ProjectStatus';
import { ProjectDescription } from '../../src/projects/ProjectDescription';
import { MilestoneId } from '../../src/projects/MilestoneId';
import { LocalDate } from '../../src/shared/LocalDate';
import { GoalId } from '../../src/goals/GoalId';
import { UserId } from '../../src/identity/UserId';

const today = LocalDate.today();
const nextMonth = LocalDate.of(
  today.year,
  today.month,
  Math.min(today.day + 1, 28)
);

describe('Project aggregate', () => {
  it('creates a project with required value objects and emits ProjectCreated', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('New Project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.of('A sample project'),
      createdBy: UserId.of('user-1'),
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
        name: ProjectName.of('Invalid'),
        status: ProjectStatus.Planned,
        startDate: nextMonth,
        targetDate: today,
        description: ProjectDescription.empty(),
        createdBy: UserId.of('user-1'),
      })
    ).toThrow(/Start date must be on or before target date/);
  });

  it('adds milestones within project date range', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Milestone project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-2'),
    });

    const milestoneId = MilestoneId.create();
    project.addMilestone({
      id: milestoneId,
      name: 'First milestone',
      targetDate: today,
    });

    expect(project.milestones).toHaveLength(1);
    expect(project.milestones[0].id.equals(milestoneId)).toBe(true);
  });

  it('rejects milestones outside project date range', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Constrained project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: today,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-3'),
    });

    expect(() =>
      project.addMilestone({
        id: MilestoneId.create(),
        name: 'Bad milestone',
        targetDate: LocalDate.of(today.year + 1, today.month, today.day),
      })
    ).toThrow(/Milestone target date must be within project dates/);
  });

  it('prevents changing project dates to exclude existing milestones', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Project with milestones'),
      status: ProjectStatus.InProgress,
      startDate: today,
      targetDate: LocalDate.of(today.year, today.month, today.day + 10),
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-4'),
    });
    project.addMilestone({
      id: MilestoneId.create(),
      name: 'Inside range',
      targetDate: LocalDate.of(today.year, today.month, today.day + 5),
    });

    expect(() =>
      project.changeDates({
        startDate: today,
        targetDate: LocalDate.of(today.year, today.month, today.day + 2),
      })
    ).toThrow(/Existing milestones must remain within the new date range/);
  });

  it('links and unlinks a goal (max one goal)', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Linked project'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-5'),
    });

    const goalId = GoalId.create();
    project.addGoal(goalId);
    expect(project.goalId?.equals(goalId)).toBe(true);

    expect(() => project.addGoal(GoalId.create())).toThrow(
      /Project already linked to a goal/
    );

    project.removeGoal();
    expect(project.goalId).toBeNull();
  });

  it('prevents mutations after deletion', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('To delete'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-6'),
    });
    project.delete();

    expect(project.isDeleted).toBe(true);
    expect(() =>
      project.changeName(ProjectName.of('New name after delete'))
    ).toThrow();
    expect(() =>
      project.addMilestone({
        id: MilestoneId.create(),
        name: 'Should fail',
        targetDate: today,
      })
    ).toThrow();
  });

  it('enforces allowed status transitions and updates updatedAt', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Lifecycle'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-7'),
    });
    const initialUpdated = project.updatedAt;

    project.changeStatus(ProjectStatus.InProgress);
    expect(project.status.equals(ProjectStatus.InProgress)).toBe(true);
    expect(
      project.updatedAt.isAfter(initialUpdated) ||
        project.updatedAt.equals(initialUpdated)
    ).toBe(true);

    expect(() => project.changeStatus(ProjectStatus.Planned)).toThrow(
      /Invalid status transition/
    );
    expect(() => project.changeStatus(ProjectStatus.InProgress)).toThrow(
      /ProjectStatus unchanged/
    );

    project.changeStatus(ProjectStatus.Canceled);
    expect(project.status.equals(ProjectStatus.Canceled)).toBe(true);
  });

  it('sets deletedAt and updatedAt on delete', () => {
    const project = Project.create({
      id: ProjectId.create(),
      name: ProjectName.of('Deletable'),
      status: ProjectStatus.Planned,
      startDate: today,
      targetDate: nextMonth,
      description: ProjectDescription.empty(),
      createdBy: UserId.of('user-8'),
    });
    project.delete();
    expect(project.deletedAt).not.toBeNull();
    expect(project.updatedAt.toISOString()).toBe(
      project.deletedAt?.toISOString()
    );
  });
});
