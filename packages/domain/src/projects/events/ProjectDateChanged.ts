import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectDateChangedPayload {
  projectId: ProjectId;
  startDate: LocalDate;
  targetDate: LocalDate;
  changedAt: Timestamp;
}

export class ProjectDateChanged
  extends DomainEvent<ProjectId>
  implements ProjectDateChangedPayload
{
  readonly eventType = projectEventTypes.projectDateChanged;

  readonly projectId: ProjectId;
  readonly startDate: LocalDate;
  readonly targetDate: LocalDate;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectDateChangedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.changedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectDateChangedSpec = payloadEventSpec<
  ProjectDateChanged,
  ProjectDateChangedPayload
>(
  projectEventTypes.projectDateChanged,
  (p, meta) => new ProjectDateChanged(p, meta),
  {
    projectId: voString(ProjectId.from),
    startDate: voString(LocalDate.fromString),
    targetDate: voString(LocalDate.fromString),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
