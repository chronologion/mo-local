import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';
import { PriorityLevel } from '../goals/Priority';

/**
 * Event emitted when a Goal's priority is changed.
 */
export class GoalPriorityChanged implements DomainEvent {
  readonly eventType = eventTypes.goalPriorityChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      priority: PriorityLevel;
      changedAt: Date;
    }
  ) {
    this.occurredAt = payload.changedAt;
    this.aggregateId = payload.goalId;
  }
}
