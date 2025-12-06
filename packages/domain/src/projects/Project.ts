import { AggregateRoot } from '../shared/AggregateRoot';
import { Assert } from '../shared/Assert';
import { Timestamp } from '../shared/Timestamp';
import { LocalDate } from '../shared/LocalDate';
import { ProjectId } from './ProjectId';
import { ProjectName } from './ProjectName';
import { ProjectStatus } from './ProjectStatus';
import { ProjectDescription } from './ProjectDescription';
import { Milestone } from './Milestone';
import { MilestoneId } from './MilestoneId';
import { GoalId } from '../goals/GoalId';
import { UserId } from '../identity/UserId';
import { ProjectCreated } from './events/ProjectCreated';
import { ProjectStatusChanged } from './events/ProjectStatusChanged';
import { ProjectDateChanged } from './events/ProjectDateChanged';
import { ProjectNameChanged } from './events/ProjectNameChanged';
import { ProjectDescriptionChanged } from './events/ProjectDescriptionChanged';
import { ProjectGoalAdded } from './events/ProjectGoalAdded';
import { ProjectGoalRemoved } from './events/ProjectGoalRemoved';
import { ProjectMilestoneAdded } from './events/ProjectMilestoneAdded';
import { ProjectMilestoneTargetDateChanged } from './events/ProjectMilestoneTargetDateChanged';
import { ProjectMilestoneNameChanged } from './events/ProjectMilestoneNameChanged';
import { ProjectMilestoneDeleted } from './events/ProjectMilestoneDeleted';
import { ProjectArchived } from './events/ProjectArchived';
import { DomainEvent } from '../shared/DomainEvent';

export class Project extends AggregateRoot<ProjectId> {
  private _name: ProjectName | undefined;
  private _status: ProjectStatus | undefined;
  private _startDate: LocalDate | undefined;
  private _targetDate: LocalDate | undefined;
  private _description: ProjectDescription | undefined;
  private _goalId: GoalId | null = null;
  private _milestones: Milestone[] = [];
  private _createdBy: UserId | undefined;
  private _createdAt: Timestamp | undefined;
  private _updatedAt: Timestamp | undefined;
  private _deletedAt: Timestamp | null = null;

  private constructor(id: ProjectId) {
    super(id);
  }

  static create(params: {
    id: ProjectId;
    name: ProjectName;
    status: ProjectStatus;
    startDate: LocalDate;
    targetDate: LocalDate;
    description: ProjectDescription;
    goalId?: GoalId | null;
    createdBy: UserId;
  }): Project {
    if (!params.startDate.isSameOrBefore(params.targetDate)) {
      throw new Error('Start date must be on or before target date');
    }

    const project = new Project(params.id);
    project.apply(
      new ProjectCreated({
        projectId: params.id.value,
        name: params.name.value,
        status: params.status.value,
        startDate: params.startDate.value,
        targetDate: params.targetDate.value,
        description: params.description.value,
        goalId: params.goalId ? params.goalId.value : null,
        createdBy: params.createdBy.value,
        createdAt: Timestamp.now().value,
      })
    );
    return project;
  }

  static reconstitute(id: ProjectId, events: readonly DomainEvent[]): Project {
    const project = new Project(id);
    project.loadFromHistory(events as DomainEvent[]);
    project.markEventsAsCommitted();
    return project;
  }

  get name(): ProjectName {
    Assert.that(this._name, 'Project name').isDefined();
    return this._name!;
  }

  get status(): ProjectStatus {
    Assert.that(this._status, 'Project status').isDefined();
    return this._status!;
  }

  get startDate(): LocalDate {
    Assert.that(this._startDate, 'Project startDate').isDefined();
    return this._startDate!;
  }

  get targetDate(): LocalDate {
    Assert.that(this._targetDate, 'Project targetDate').isDefined();
    return this._targetDate!;
  }

  get description(): ProjectDescription {
    Assert.that(this._description, 'Project description').isDefined();
    return this._description!;
  }

  get goalId(): GoalId | null {
    return this._goalId;
  }

  get milestones(): ReadonlyArray<Milestone> {
    return this._milestones;
  }

  get createdBy(): UserId {
    Assert.that(this._createdBy, 'Project createdBy').isDefined();
    return this._createdBy!;
  }

  get createdAt(): Timestamp {
    Assert.that(this._createdAt, 'Project createdAt').isDefined();
    return this._createdAt!;
  }

  get updatedAt(): Timestamp {
    Assert.that(this._updatedAt, 'Project updatedAt').isDefined();
    return this._updatedAt!;
  }

  get deletedAt(): Timestamp | null {
    return this._deletedAt;
  }

  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  changeName(name: ProjectName): void {
    this.assertNotDeleted();
    Assert.that(name.equals(this.name), 'ProjectName unchanged').isFalse();
    this.apply(
      new ProjectNameChanged({
        projectId: this.id.value,
        name: name.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  changeDescription(description: ProjectDescription): void {
    this.assertNotDeleted();
    Assert.that(
      description.equals(this.description),
      'ProjectDescription unchanged'
    ).isFalse();
    this.apply(
      new ProjectDescriptionChanged({
        projectId: this.id.value,
        description: description.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  changeStatus(status: ProjectStatus): void {
    this.assertNotDeleted();
    Assert.that(
      status.equals(this.status),
      'ProjectStatus unchanged'
    ).isFalse();
    this.assertAllowedStatusTransition(status);
    this.apply(
      new ProjectStatusChanged({
        projectId: this.id.value,
        status: status.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  changeDates(params: { startDate: LocalDate; targetDate: LocalDate }): void {
    this.assertNotDeleted();
    if (!params.startDate.isSameOrBefore(params.targetDate)) {
      throw new Error('Start date must be on or before target date');
    }
    const milestonesWithinRange = this._milestones.every(
      (m) =>
        params.startDate.isSameOrBefore(m.targetDate) &&
        params.targetDate.isSameOrAfter(m.targetDate)
    );
    Assert.that(
      milestonesWithinRange,
      'Existing milestones must remain within the new date range'
    ).isTrue();

    this.apply(
      new ProjectDateChanged({
        projectId: this.id.value,
        startDate: params.startDate.value,
        targetDate: params.targetDate.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  addGoal(goalId: GoalId): void {
    this.assertNotDeleted();
    Assert.that(
      this._goalId === null,
      'Project already linked to a goal'
    ).isTrue();
    this.apply(
      new ProjectGoalAdded({
        projectId: this.id.value,
        goalId: goalId.value,
        addedAt: Timestamp.now().value,
      })
    );
  }

  removeGoal(): void {
    this.assertNotDeleted();
    if (this._goalId === null) {
      return;
    }
    this.apply(
      new ProjectGoalRemoved({
        projectId: this.id.value,
        removedAt: Timestamp.now().value,
      })
    );
  }

  addMilestone(params: {
    id: MilestoneId;
    name: string;
    targetDate: LocalDate;
  }): void {
    this.assertNotDeleted();
    this.assertDateWithinRange(params.targetDate);
    Assert.that(
      this._milestones.some((m) => m.id.equals(params.id)),
      'Duplicate milestone id'
    ).isFalse();
    this.apply(
      new ProjectMilestoneAdded({
        projectId: this.id.value,
        milestoneId: params.id.value,
        name: params.name,
        targetDate: params.targetDate.value,
        addedAt: Timestamp.now().value,
      })
    );
  }

  changeMilestoneName(milestoneId: MilestoneId, name: string): void {
    this.assertNotDeleted();
    const milestone = this.findMilestone(milestoneId);
    Assert.that(name.trim(), 'Milestone name').isNonEmpty();
    Assert.that(milestone.name === name, 'Milestone name unchanged').isFalse();
    this.apply(
      new ProjectMilestoneNameChanged({
        projectId: this.id.value,
        milestoneId: milestoneId.value,
        name,
        changedAt: Timestamp.now().value,
      })
    );
  }

  changeMilestoneTargetDate(
    milestoneId: MilestoneId,
    targetDate: LocalDate
  ): void {
    this.assertNotDeleted();
    this.assertDateWithinRange(targetDate);
    const milestone = this.findMilestone(milestoneId);
    Assert.that(
      milestone.targetDate.equals(targetDate),
      'Milestone target unchanged'
    ).isFalse();
    this.apply(
      new ProjectMilestoneTargetDateChanged({
        projectId: this.id.value,
        milestoneId: milestoneId.value,
        targetDate: targetDate.value,
        changedAt: Timestamp.now().value,
      })
    );
  }

  deleteMilestone(milestoneId: MilestoneId): void {
    this.assertNotDeleted();
    this.findMilestone(milestoneId);
    this.apply(
      new ProjectMilestoneDeleted({
        projectId: this.id.value,
        milestoneId: milestoneId.value,
        deletedAt: Timestamp.now().value,
      })
    );
  }

  delete(): void {
    this.assertNotDeleted();
    this.apply(
      new ProjectArchived({
        projectId: this.id.value,
        deletedAt: Timestamp.now().value,
      })
    );
  }

  // === Event handlers ===

  private onProjectCreated(event: ProjectCreated): void {
    this._name = ProjectName.of(event.payload.name);
    this._status = ProjectStatus.of(event.payload.status);
    this._startDate = LocalDate.fromString(event.payload.startDate);
    this._targetDate = LocalDate.fromString(event.payload.targetDate);
    this._description = ProjectDescription.of(event.payload.description);
    this._goalId = event.payload.goalId
      ? GoalId.of(event.payload.goalId)
      : null;
    this._createdBy = UserId.of(event.payload.createdBy);
    this._createdAt = Timestamp.of(new Date(event.payload.createdAt));
    this._updatedAt = this._createdAt;
  }

  private onProjectStatusChanged(event: ProjectStatusChanged): void {
    this._status = ProjectStatus.of(event.payload.status);
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectDateChanged(event: ProjectDateChanged): void {
    this._startDate = LocalDate.fromString(event.payload.startDate);
    this._targetDate = LocalDate.fromString(event.payload.targetDate);
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectNameChanged(event: ProjectNameChanged): void {
    this._name = ProjectName.of(event.payload.name);
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectDescriptionChanged(event: ProjectDescriptionChanged): void {
    this._description = ProjectDescription.of(event.payload.description);
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectGoalAdded(event: ProjectGoalAdded): void {
    this._goalId = GoalId.of(event.payload.goalId);
    this._updatedAt = Timestamp.of(new Date(event.payload.addedAt));
  }

  private onProjectGoalRemoved(event: ProjectGoalRemoved): void {
    this._goalId = null;
    this._updatedAt = Timestamp.of(new Date(event.payload.removedAt));
  }

  private onProjectMilestoneAdded(event: ProjectMilestoneAdded): void {
    const milestone = Milestone.create({
      id: MilestoneId.of(event.payload.milestoneId),
      name: event.payload.name,
      targetDate: LocalDate.fromString(event.payload.targetDate),
    });
    this._milestones.push(milestone);
    this._updatedAt = Timestamp.of(new Date(event.payload.addedAt));
  }

  private onProjectMilestoneTargetDateChanged(
    event: ProjectMilestoneTargetDateChanged
  ): void {
    const milestone = this.findMilestone(
      MilestoneId.of(event.payload.milestoneId)
    );
    milestone.changeTargetDate(LocalDate.fromString(event.payload.targetDate));
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectMilestoneNameChanged(
    event: ProjectMilestoneNameChanged
  ): void {
    const milestone = this.findMilestone(
      MilestoneId.of(event.payload.milestoneId)
    );
    milestone.changeName(event.payload.name);
    this._updatedAt = Timestamp.of(new Date(event.payload.changedAt));
  }

  private onProjectMilestoneDeleted(event: ProjectMilestoneDeleted): void {
    this._milestones = this._milestones.filter(
      (m) => !m.id.equals(MilestoneId.of(event.payload.milestoneId))
    );
    this._updatedAt = Timestamp.of(new Date(event.payload.deletedAt));
  }

  private onProjectArchived(event: ProjectArchived): void {
    this._deletedAt = Timestamp.of(new Date(event.payload.deletedAt));
    this._updatedAt = Timestamp.of(new Date(event.payload.deletedAt));
  }

  // === Helpers ===

  private assertNotDeleted(): void {
    Assert.that(this.isDeleted, 'Project is deleted').isFalse();
  }

  private assertDateWithinRange(date: LocalDate): void {
    Assert.that(
      this.startDate.isSameOrBefore(date) &&
        this.targetDate.isSameOrAfter(date),
      'Milestone target date must be within project dates'
    ).isTrue();
  }

  private assertAllowedStatusTransition(next: ProjectStatus): void {
    const current = this.status;
    const allowed: Record<ProjectStatus['value'], ProjectStatus['value'][]> = {
      planned: ['in_progress', 'canceled'],
      in_progress: ['completed', 'canceled'],
      completed: [],
      canceled: [],
    };
    if (!allowed[current.value].includes(next.value)) {
      throw new Error(
        `Invalid status transition from ${current.value} to ${next.value}`
      );
    }
  }

  private findMilestone(id: MilestoneId): Milestone {
    const milestone = this._milestones.find((m) => m.id.equals(id));
    if (!milestone) {
      throw new Error(`Milestone ${id.value} not found`);
    }
    return milestone;
  }
}
