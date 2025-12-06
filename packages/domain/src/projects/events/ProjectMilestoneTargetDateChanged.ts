import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectMilestoneTargetDateChanged implements DomainEvent {
  readonly eventType = projectEventTypes.projectMilestoneTargetDateChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      milestoneId: string;
      targetDate: string;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.changedAt;
  }
}
