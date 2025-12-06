import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectMilestoneAdded implements DomainEvent {
  readonly eventType = projectEventTypes.projectMilestoneAdded;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      milestoneId: string;
      name: string;
      targetDate: string;
      addedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.addedAt;
  }
}
