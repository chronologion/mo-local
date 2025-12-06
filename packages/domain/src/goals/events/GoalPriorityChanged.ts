import { DomainEvent } from '../../shared/DomainEvent';
import { PriorityLevel } from '../Priority';
import { goalEventTypes } from './eventTypes';

export class GoalPriorityChanged implements DomainEvent {
  readonly eventType = goalEventTypes.goalPriorityChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      priority: PriorityLevel;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.changedAt;
  }
}
