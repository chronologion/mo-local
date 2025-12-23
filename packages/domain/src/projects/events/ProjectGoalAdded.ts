import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { GoalId } from '../../goals/vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectGoalAddedPayload {
  projectId: ProjectId;
  goalId: GoalId;
  addedAt: Timestamp;
}

export class ProjectGoalAdded
  extends DomainEvent<ProjectId>
  implements ProjectGoalAddedPayload
{
  readonly eventType = projectEventTypes.projectGoalAdded;

  readonly projectId: ProjectId;
  readonly goalId: GoalId;
  readonly addedAt: Timestamp;

  constructor(payload: ProjectGoalAddedPayload) {
    super(payload.projectId, payload.addedAt);
    this.projectId = payload.projectId;
    this.goalId = payload.goalId;
    this.addedAt = payload.addedAt;
    Object.freeze(this);
  }
}

export const ProjectGoalAddedSpec = payloadEventSpec<
  ProjectGoalAdded,
  ProjectGoalAddedPayload
>(projectEventTypes.projectGoalAdded, (p) => new ProjectGoalAdded(p), {
  projectId: voString(ProjectId.from),
  goalId: voString(GoalId.from),
  addedAt: voNumber(Timestamp.fromMillis),
});
