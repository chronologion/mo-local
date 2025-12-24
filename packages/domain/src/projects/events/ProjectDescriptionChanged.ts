import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectDescription } from '../vos/ProjectDescription';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectDescriptionChangedPayload {
  projectId: ProjectId;
  description: ProjectDescription;
  changedAt: Timestamp;
}

export class ProjectDescriptionChanged
  extends DomainEvent<ProjectId>
  implements ProjectDescriptionChangedPayload
{
  readonly eventType = projectEventTypes.projectDescriptionChanged;

  readonly projectId: ProjectId;
  readonly description: ProjectDescription;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectDescriptionChangedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.changedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.description = payload.description;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectDescriptionChangedSpec = payloadEventSpec<
  ProjectDescriptionChanged,
  ProjectDescriptionChangedPayload
>(
  projectEventTypes.projectDescriptionChanged,
  (p, meta) => new ProjectDescriptionChanged(p, meta),
  {
    projectId: voString(ProjectId.from),
    description: voString(ProjectDescription.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
