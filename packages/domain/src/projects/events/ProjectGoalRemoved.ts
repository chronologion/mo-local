import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectGoalRemovedPayload {
  projectId: ProjectId;
  removedAt: Timestamp;
}

export class ProjectGoalRemoved
  extends DomainEvent<ProjectId>
  implements ProjectGoalRemovedPayload
{
  readonly eventType = projectEventTypes.projectGoalRemoved;

  readonly projectId: ProjectId;
  readonly removedAt: Timestamp;

  constructor(payload: ProjectGoalRemovedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.removedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.removedAt = payload.removedAt;
    Object.freeze(this);
  }
}

export const ProjectGoalRemovedSpec = payloadEventSpec<
  ProjectGoalRemoved,
  ProjectGoalRemovedPayload
>(
  projectEventTypes.projectGoalRemoved,
  (p, meta) => new ProjectGoalRemoved(p, meta),
  {
    projectId: voString(ProjectId.from),
    removedAt: voNumber(Timestamp.fromMillis),
  }
);
