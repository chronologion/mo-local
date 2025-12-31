import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { MilestoneName } from '../vos/MilestoneName';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectMilestoneAddedPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  name: MilestoneName;
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
  readonly name: MilestoneName;
  readonly targetDate: LocalDate;
  readonly addedAt: Timestamp;

  constructor(
    payload: ProjectMilestoneAddedPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.targetDate = payload.targetDate;
    this.addedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneAddedSpec = payloadEventSpec<
  ProjectMilestoneAdded,
  ProjectMilestoneAddedPayload,
  ProjectId
>(
  projectEventTypes.projectMilestoneAdded,
  (p, meta) => new ProjectMilestoneAdded(p, meta),
  {
    projectId: voString(ProjectId.from),
    milestoneId: voString(MilestoneId.from),
    name: voString(MilestoneName.from),
    targetDate: voString(LocalDate.fromString),
    addedAt: voNumber(Timestamp.fromMillis),
  }
);
