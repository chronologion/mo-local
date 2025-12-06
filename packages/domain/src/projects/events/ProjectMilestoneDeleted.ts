import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectMilestoneDeleted implements DomainEvent {
  readonly eventType = projectEventTypes.projectMilestoneDeleted;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      milestoneId: string;
      deletedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.deletedAt;
  }
}
