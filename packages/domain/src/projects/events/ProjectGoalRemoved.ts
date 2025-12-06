import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectGoalRemoved implements DomainEvent {
  readonly eventType = projectEventTypes.projectGoalRemoved;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      removedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.removedAt;
  }
}
