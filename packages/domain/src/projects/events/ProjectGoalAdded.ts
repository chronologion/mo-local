import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
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

  constructor(
    payload: ProjectGoalAddedPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.goalId = payload.goalId;
    this.addedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectGoalAddedSpec = payloadEventSpec<
  ProjectGoalAdded,
  ProjectGoalAddedPayload,
  ProjectId
>(
  projectEventTypes.projectGoalAdded,
  (p, meta) => new ProjectGoalAdded(p, meta),
  {
    projectId: voString(ProjectId.from),
    goalId: voString(GoalId.from),
    addedAt: voNumber(Timestamp.fromMillis),
  }
);
