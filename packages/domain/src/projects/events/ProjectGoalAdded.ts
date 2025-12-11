import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { GoalId } from '../../goals/vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectGoalAdded implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectGoalAdded;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      goalId: GoalId;
      addedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.addedAt;
  }
}
