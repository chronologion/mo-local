import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { ProjectStatus } from '../vos/ProjectStatus';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { projectEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectStatusChangedPayload {
  projectId: ProjectId;
  status: ProjectStatus;
  changedAt: Timestamp;
}

export class ProjectStatusChanged
  extends DomainEvent<ProjectId>
  implements ProjectStatusChangedPayload
{
  readonly eventType = projectEventTypes.projectStatusChanged;

  readonly projectId: ProjectId;
  readonly status: ProjectStatus;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectStatusChangedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.changedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.status = payload.status;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectStatusChangedSpec = payloadEventSpec<
  ProjectStatusChanged,
  ProjectStatusChangedPayload
>(
  projectEventTypes.projectStatusChanged,
  (p, meta) => new ProjectStatusChanged(p, meta),
  {
    projectId: voString(ProjectId.from),
    status: voString(ProjectStatus.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
