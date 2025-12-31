import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectMilestoneRescheduledPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  targetDate: LocalDate;
  changedAt: Timestamp;
}

export class ProjectMilestoneRescheduled
  extends DomainEvent<ProjectId>
  implements ProjectMilestoneRescheduledPayload
{
  readonly eventType = projectEventTypes.projectMilestoneRescheduled;

  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly targetDate: LocalDate;
  readonly changedAt: Timestamp;

  constructor(
    payload: ProjectMilestoneRescheduledPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.milestoneId = payload.milestoneId;
    this.targetDate = payload.targetDate;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneRescheduledSpec = payloadEventSpec<
  ProjectMilestoneRescheduled,
  ProjectMilestoneRescheduledPayload,
  ProjectId
>(
  projectEventTypes.projectMilestoneRescheduled,
  (p, meta) => new ProjectMilestoneRescheduled(p, meta),
  {
    projectId: voString(ProjectId.from),
    milestoneId: voString(MilestoneId.from),
    targetDate: voString(LocalDate.fromString),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
