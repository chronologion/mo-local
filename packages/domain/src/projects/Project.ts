import { AggregateRoot } from '../shared/AggregateRoot';
import { Assert } from '../shared/Assert';
import { Timestamp } from '../shared/vos/Timestamp';
import { LocalDate } from '../shared/vos/LocalDate';
import { ProjectId } from './vos/ProjectId';
import { ProjectName } from './vos/ProjectName';
import { ProjectStatus } from './vos/ProjectStatus';
import { ProjectDescription } from './vos/ProjectDescription';
import { Milestone } from './Milestone';
import { MilestoneId } from './vos/MilestoneId';
import { MilestoneName } from './vos/MilestoneName';
import { GoalId } from '../goals/vos/GoalId';
import { UserId } from '../identity/UserId';
import { ProjectCreated } from './events/ProjectCreated';
import { ProjectStatusTransitioned } from './events/ProjectStatusTransitioned';
import { ProjectRescheduled } from './events/ProjectRescheduled';
import { ProjectRenamed } from './events/ProjectRenamed';
import { ProjectDescribed } from './events/ProjectDescribed';
import { ProjectGoalAdded } from './events/ProjectGoalAdded';
import { ProjectGoalRemoved } from './events/ProjectGoalRemoved';
import { ProjectMilestoneAdded } from './events/ProjectMilestoneAdded';
import { ProjectMilestoneRescheduled } from './events/ProjectMilestoneRescheduled';
import { ProjectMilestoneRenamed } from './events/ProjectMilestoneRenamed';
import { ProjectMilestoneArchived } from './events/ProjectMilestoneArchived';
import { ProjectArchived } from './events/ProjectArchived';
import { DomainEvent } from '../shared/DomainEvent';
import { EventId } from '../shared/vos/EventId';

export type ProjectSnapshot = {
  id: ProjectId;
  name: ProjectName;
  status: ProjectStatus;
  startDate: LocalDate;
  targetDate: LocalDate;
  description: ProjectDescription;
  goalId: GoalId | null;
  milestones: Milestone[];
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt: Timestamp | null;
  version: number;
};

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
  private _archivedAt: Timestamp | null = null;

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
    createdAt: Timestamp;
  }): Project {
    if (!params.startDate.isSameOrBefore(params.targetDate)) {
      throw new Error('Start date must be on or before target date');
    }

    const project = new Project(params.id);
    project.apply(
      new ProjectCreated(
        {
          projectId: params.id,
          name: params.name,
          status: params.status,
          startDate: params.startDate,
          targetDate: params.targetDate,
          description: params.description,
          goalId: params.goalId ?? null,
          createdBy: params.createdBy,
          createdAt: params.createdAt,
        },
        { eventId: EventId.create(), actorId: params.createdBy }
      )
    );
    return project;
  }

  static reconstitute(id: ProjectId, events: readonly DomainEvent[]): Project {
    const project = new Project(id);
    project.loadFromHistory(events as DomainEvent[]);
    project.markEventsAsCommitted();
    return project;
  }

  static reconstituteFromSnapshot(
    snapshot: ProjectSnapshot,
    tailEvents: readonly DomainEvent[]
  ): Project {
    const project = new Project(snapshot.id);
    project.hydrateFromSnapshot(snapshot);
    project.loadFromHistory(tailEvents as DomainEvent[]);
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

  get archivedAt(): Timestamp | null {
    return this._archivedAt;
  }

  get isArchived(): boolean {
    return this._archivedAt !== null;
  }

  changeName(params: {
    name: ProjectName;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    Assert.that(
      params.name.equals(this.name),
      'ProjectName unchanged'
    ).isFalse();
    this.apply(
      new ProjectRenamed(
        {
          projectId: this.id,
          name: params.name,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  changeDescription(params: {
    description: ProjectDescription;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    Assert.that(
      params.description.equals(this.description),
      'ProjectDescription unchanged'
    ).isFalse();
    this.apply(
      new ProjectDescribed(
        {
          projectId: this.id,
          description: params.description,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  changeStatus(params: {
    status: ProjectStatus;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    Assert.that(
      params.status.equals(this.status),
      'ProjectStatus unchanged'
    ).isFalse();
    this.assertAllowedStatusTransition(params.status);
    this.apply(
      new ProjectStatusTransitioned(
        {
          projectId: this.id,
          status: params.status,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  changeDates(params: {
    startDate: LocalDate;
    targetDate: LocalDate;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
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
      new ProjectRescheduled(
        {
          projectId: this.id,
          startDate: params.startDate,
          targetDate: params.targetDate,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  addGoal(params: {
    goalId: GoalId;
    addedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    Assert.that(
      this._goalId === null,
      'Project already linked to a goal'
    ).isTrue();
    this.apply(
      new ProjectGoalAdded(
        {
          projectId: this.id,
          goalId: params.goalId,
          addedAt: params.addedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  removeGoal(params: { removedAt: Timestamp; actorId: UserId }): void {
    this.assertNotArchived();
    if (this._goalId === null) {
      return;
    }
    this.apply(
      new ProjectGoalRemoved(
        {
          projectId: this.id,
          removedAt: params.removedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  addMilestone(params: {
    id: MilestoneId;
    name: MilestoneName;
    targetDate: LocalDate;
    addedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    this.assertDateWithinRange(params.targetDate);
    Assert.that(
      this._milestones.some((m) => m.id.equals(params.id)),
      'Duplicate milestone id'
    ).isFalse();
    this.apply(
      new ProjectMilestoneAdded(
        {
          projectId: this.id,
          milestoneId: params.id,
          name: params.name,
          targetDate: params.targetDate,
          addedAt: params.addedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  changeMilestoneName(params: {
    milestoneId: MilestoneId;
    name: MilestoneName;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    const milestone = this.findMilestone(params.milestoneId);
    Assert.that(params.name, 'Milestone name').isDefined();
    Assert.that(
      milestone.name.equals(params.name),
      'Milestone name unchanged'
    ).isFalse();
    this.apply(
      new ProjectMilestoneRenamed(
        {
          projectId: this.id,
          milestoneId: params.milestoneId,
          name: params.name,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  changeMilestoneTargetDate(params: {
    milestoneId: MilestoneId;
    targetDate: LocalDate;
    changedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    this.assertDateWithinRange(params.targetDate);
    const milestone = this.findMilestone(params.milestoneId);
    Assert.that(
      milestone.targetDate.equals(params.targetDate),
      'Milestone target unchanged'
    ).isFalse();
    this.apply(
      new ProjectMilestoneRescheduled(
        {
          projectId: this.id,
          milestoneId: params.milestoneId,
          targetDate: params.targetDate,
          changedAt: params.changedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  archiveMilestone(params: {
    milestoneId: MilestoneId;
    archivedAt: Timestamp;
    actorId: UserId;
  }): void {
    this.assertNotArchived();
    this.findMilestone(params.milestoneId);
    this.apply(
      new ProjectMilestoneArchived(
        {
          projectId: this.id,
          milestoneId: params.milestoneId,
          archivedAt: params.archivedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  archive(params: { archivedAt: Timestamp; actorId: UserId }): void {
    this.assertNotArchived();
    this.apply(
      new ProjectArchived(
        {
          projectId: this.id,
          archivedAt: params.archivedAt,
        },
        { eventId: EventId.create(), actorId: params.actorId }
      )
    );
  }

  // === Event handlers ===

  private onProjectCreated(event: ProjectCreated): void {
    this._name = event.name;
    this._status = event.status;
    this._startDate = event.startDate;
    this._targetDate = event.targetDate;
    this._description = event.description;
    this._goalId = event.goalId;
    this._createdBy = event.createdBy;
    this._createdAt = event.createdAt;
    this._updatedAt = this._createdAt;
  }

  private onProjectStatusTransitioned(event: ProjectStatusTransitioned): void {
    this._status = event.status;
    this._updatedAt = event.changedAt;
  }

  private onProjectRescheduled(event: ProjectRescheduled): void {
    this._startDate = event.startDate;
    this._targetDate = event.targetDate;
    this._updatedAt = event.changedAt;
  }

  private onProjectRenamed(event: ProjectRenamed): void {
    this._name = event.name;
    this._updatedAt = event.changedAt;
  }

  private onProjectDescribed(event: ProjectDescribed): void {
    this._description = event.description;
    this._updatedAt = event.changedAt;
  }

  private onProjectGoalAdded(event: ProjectGoalAdded): void {
    this._goalId = event.goalId;
    this._updatedAt = event.addedAt;
  }

  private onProjectGoalRemoved(event: ProjectGoalRemoved): void {
    this._goalId = null;
    this._updatedAt = event.removedAt;
  }

  private onProjectMilestoneAdded(event: ProjectMilestoneAdded): void {
    const milestone = Milestone.create({
      id: event.milestoneId,
      name: event.name,
      targetDate: event.targetDate,
    });
    this._milestones.push(milestone);
    this._updatedAt = event.addedAt;
  }

  private onProjectMilestoneRescheduled(
    event: ProjectMilestoneRescheduled
  ): void {
    const milestone = this.findMilestone(event.milestoneId);
    milestone.changeTargetDate(event.targetDate);
    this._updatedAt = event.changedAt;
  }

  private onProjectMilestoneRenamed(event: ProjectMilestoneRenamed): void {
    const milestone = this.findMilestone(event.milestoneId);
    milestone.changeName(event.name);
    this._updatedAt = event.changedAt;
  }

  private onProjectMilestoneArchived(event: ProjectMilestoneArchived): void {
    this._milestones = this._milestones.filter(
      (m) => !m.id.equals(event.milestoneId)
    );
    this._updatedAt = event.archivedAt;
  }

  private onProjectArchived(event: ProjectArchived): void {
    this._archivedAt = event.archivedAt;
    this._updatedAt = event.archivedAt;
  }

  // === Helpers ===

  private hydrateFromSnapshot(snapshot: ProjectSnapshot): void {
    this._name = snapshot.name;
    this._status = snapshot.status;
    this._startDate = snapshot.startDate;
    this._targetDate = snapshot.targetDate;
    this._description = snapshot.description;
    this._goalId = snapshot.goalId;
    this._milestones = snapshot.milestones;
    this._createdBy = snapshot.createdBy;
    this._createdAt = snapshot.createdAt;
    this._updatedAt = snapshot.updatedAt;
    this._archivedAt = snapshot.archivedAt;
    this.restoreVersion(snapshot.version);
  }

  private assertNotArchived(): void {
    Assert.that(this.isArchived, 'Project is archived').isFalse();
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
