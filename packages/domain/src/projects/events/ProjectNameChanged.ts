import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectName } from '../vos/ProjectName';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectNameChangedPayload {
  projectId: ProjectId;
  name: ProjectName;
  changedAt: Timestamp;
}

export class ProjectNameChanged
  extends DomainEvent<ProjectId>
  implements ProjectNameChangedPayload
{
  readonly eventType = projectEventTypes.projectNameChanged;

  readonly projectId: ProjectId;
  readonly name: ProjectName;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectNameChangedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.changedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectNameChangedSpec = payloadEventSpec<
  ProjectNameChanged,
  ProjectNameChangedPayload
>(
  projectEventTypes.projectNameChanged,
  (p, meta) => new ProjectNameChanged(p, meta),
  {
    projectId: voString(ProjectId.from),
    name: voString(ProjectName.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
