import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectName } from '../vos/ProjectName';
import { ProjectStatus } from '../vos/ProjectStatus';
import { LocalDate } from '../../shared/vos/LocalDate';
import { ProjectDescription } from '../vos/ProjectDescription';
import { GoalId } from '../../goals/vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import {
  nullable,
  payloadEventSpec,
  voNumber,
  voString,
} from '../../shared/eventSpec';

export interface ProjectCreatedPayload {
  projectId: ProjectId;
  name: ProjectName;
  status: ProjectStatus;
  startDate: LocalDate;
  targetDate: LocalDate;
  description: ProjectDescription;
  goalId: GoalId | null;
  createdBy: UserId;
  createdAt: Timestamp;
}

export class ProjectCreated
  extends DomainEvent<ProjectId>
  implements ProjectCreatedPayload
{
  readonly eventType = projectEventTypes.projectCreated;

  readonly projectId: ProjectId;
  readonly name: ProjectName;
  readonly status: ProjectStatus;
  readonly startDate: LocalDate;
  readonly targetDate: LocalDate;
  readonly description: ProjectDescription;
  readonly goalId: GoalId | null;
  readonly createdBy: UserId;
  readonly createdAt: Timestamp;

  constructor(payload: ProjectCreatedPayload) {
    super(payload.projectId, payload.createdAt);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.status = payload.status;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.description = payload.description;
    this.goalId = payload.goalId;
    this.createdBy = payload.createdBy;
    this.createdAt = payload.createdAt;
    Object.freeze(this);
  }
}

export const ProjectCreatedSpec = payloadEventSpec<
  ProjectCreated,
  ProjectCreatedPayload
>(projectEventTypes.projectCreated, (p) => new ProjectCreated(p), {
  projectId: voString(ProjectId.from),
  name: voString(ProjectName.from),
  status: voString(ProjectStatus.from),
  startDate: voString(LocalDate.fromString),
  targetDate: voString(LocalDate.fromString),
  description: voString(ProjectDescription.from),
  goalId: nullable(voString(GoalId.from)),
  createdBy: voString(UserId.from),
  createdAt: voNumber(Timestamp.fromMillis),
});
