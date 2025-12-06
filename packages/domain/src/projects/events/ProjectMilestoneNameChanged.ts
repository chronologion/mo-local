import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectMilestoneNameChanged implements DomainEvent {
  readonly eventType = projectEventTypes.projectMilestoneNameChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      milestoneId: string;
      name: string;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.changedAt;
  }
}
