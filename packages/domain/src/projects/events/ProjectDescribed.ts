import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectDescription } from '../vos/ProjectDescription';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectDescribedPayload {
  projectId: ProjectId;
  description: ProjectDescription;
  changedAt: Timestamp;
}

export class ProjectDescribed
  extends DomainEvent<ProjectId>
  implements ProjectDescribedPayload
{
  readonly eventType = projectEventTypes.projectDescribed;

  readonly projectId: ProjectId;
  readonly description: ProjectDescription;
  readonly changedAt: Timestamp;

  constructor(
    payload: ProjectDescribedPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.description = payload.description;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectDescribedSpec = payloadEventSpec<
  ProjectDescribed,
  ProjectDescribedPayload,
  ProjectId
>(
  projectEventTypes.projectDescribed,
  (p, meta) => new ProjectDescribed(p, meta),
  {
    projectId: voString(ProjectId.from),
    description: voString(ProjectDescription.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
