import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';

export class GoalArchived implements DomainEvent {
  readonly eventType = goalEventTypes.goalArchived;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      deletedAt: Date;
    }
  ) {
    this.occurredAt = payload.deletedAt;
    this.aggregateId = payload.goalId;
  }
}
