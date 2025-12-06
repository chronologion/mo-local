import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';

export class GoalTargetChanged implements DomainEvent {
  readonly eventType = goalEventTypes.goalTargetChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      targetMonth: string;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.changedAt;
  }
}
