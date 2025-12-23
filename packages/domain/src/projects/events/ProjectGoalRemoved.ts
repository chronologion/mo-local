import { DomainEvent } from '../../shared/DomainEvent';
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

  constructor(payload: ProjectGoalRemovedPayload) {
    super(payload.projectId, payload.removedAt);
    this.projectId = payload.projectId;
    this.removedAt = payload.removedAt;
    Object.freeze(this);
  }
}

export const ProjectGoalRemovedSpec = payloadEventSpec<
  ProjectGoalRemoved,
  ProjectGoalRemovedPayload
>(projectEventTypes.projectGoalRemoved, (p) => new ProjectGoalRemoved(p), {
  projectId: voString(ProjectId.from),
  removedAt: voNumber(Timestamp.fromMillis),
});
