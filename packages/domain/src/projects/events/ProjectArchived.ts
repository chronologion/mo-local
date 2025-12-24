import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectArchivedPayload {
  projectId: ProjectId;
  archivedAt: Timestamp;
}

export class ProjectArchived
  extends DomainEvent<ProjectId>
  implements ProjectArchivedPayload
{
  readonly eventType = projectEventTypes.projectArchived;

  readonly projectId: ProjectId;
  readonly archivedAt: Timestamp;

  constructor(payload: ProjectArchivedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.archivedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.archivedAt = payload.archivedAt;
    Object.freeze(this);
  }
}

export const ProjectArchivedSpec = payloadEventSpec<
  ProjectArchived,
  ProjectArchivedPayload
>(
  projectEventTypes.projectArchived,
  (p, meta) => new ProjectArchived(p, meta),
  {
    projectId: voString(ProjectId.from),
    archivedAt: voNumber(Timestamp.fromMillis),
  }
);
