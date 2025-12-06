import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';

export class GoalSummaryChanged implements DomainEvent {
  readonly eventType = goalEventTypes.goalSummaryChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      summary: string;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.changedAt;
  }
}
