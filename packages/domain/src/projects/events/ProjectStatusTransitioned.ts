import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { ProjectStatus } from '../vos/ProjectStatus';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { projectEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectStatusTransitionedPayload {
  projectId: ProjectId;
  status: ProjectStatus;
  changedAt: Timestamp;
}

export class ProjectStatusTransitioned
  extends DomainEvent<ProjectId>
  implements ProjectStatusTransitionedPayload
{
  readonly eventType = projectEventTypes.projectStatusTransitioned;

  readonly projectId: ProjectId;
  readonly status: ProjectStatus;
  readonly changedAt: Timestamp;

  constructor(
    payload: ProjectStatusTransitionedPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.status = payload.status;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectStatusTransitionedSpec = payloadEventSpec<
  ProjectStatusTransitioned,
  ProjectStatusTransitionedPayload,
  ProjectId
>(
  projectEventTypes.projectStatusTransitioned,
  (p, meta) => new ProjectStatusTransitioned(p, meta),
  {
    projectId: voString(ProjectId.from),
    status: voString(ProjectStatus.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
