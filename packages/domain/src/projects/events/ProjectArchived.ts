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

  constructor(payload: ProjectArchivedPayload, meta: EventMetadata<ProjectId>) {
    super(meta);
    this.projectId = this.aggregateId;
    this.archivedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectArchivedSpec = payloadEventSpec<
  ProjectArchived,
  ProjectArchivedPayload,
  ProjectId
>(
  projectEventTypes.projectArchived,
  (p, meta) => new ProjectArchived(p, meta),
  {
    projectId: voString(ProjectId.from),
    archivedAt: voNumber(Timestamp.fromMillis),
  }
);
