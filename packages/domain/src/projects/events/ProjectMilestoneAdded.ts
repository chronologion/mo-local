import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import {
  payloadEventSpec,
  stringField,
  voNumber,
  voString,
} from '../../shared/eventSpec';

export interface ProjectMilestoneAddedPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  name: string;
  targetDate: LocalDate;
  addedAt: Timestamp;
}

export class ProjectMilestoneAdded
  extends DomainEvent<ProjectId>
  implements ProjectMilestoneAddedPayload
{
  readonly eventType = projectEventTypes.projectMilestoneAdded;

  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly name: string;
  readonly targetDate: LocalDate;
  readonly addedAt: Timestamp;

  constructor(payload: ProjectMilestoneAddedPayload) {
    super(payload.projectId, payload.addedAt);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.targetDate = payload.targetDate;
    this.addedAt = payload.addedAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneAddedSpec = payloadEventSpec<
  ProjectMilestoneAdded,
  ProjectMilestoneAddedPayload
>(
  projectEventTypes.projectMilestoneAdded,
  (p) => new ProjectMilestoneAdded(p),
  {
    projectId: voString(ProjectId.from),
    milestoneId: voString(MilestoneId.from),
    name: stringField(),
    targetDate: voString(LocalDate.fromString),
    addedAt: voNumber(Timestamp.fromMillis),
  }
);
