import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectRescheduledPayload {
  projectId: ProjectId;
  startDate: LocalDate;
  targetDate: LocalDate;
  changedAt: Timestamp;
}

export class ProjectRescheduled
  extends DomainEvent<ProjectId>
  implements ProjectRescheduledPayload
{
  readonly eventType = projectEventTypes.projectRescheduled;

  readonly projectId: ProjectId;
  readonly startDate: LocalDate;
  readonly targetDate: LocalDate;
  readonly changedAt: Timestamp;

  constructor(
    payload: ProjectRescheduledPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectRescheduledSpec = payloadEventSpec<
  ProjectRescheduled,
  ProjectRescheduledPayload,
  ProjectId
>(
  projectEventTypes.projectRescheduled,
  (p, meta) => new ProjectRescheduled(p, meta),
  {
    projectId: voString(ProjectId.from),
    startDate: voString(LocalDate.fromString),
    targetDate: voString(LocalDate.fromString),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
