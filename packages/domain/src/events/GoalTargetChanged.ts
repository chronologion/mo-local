import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';

/**
 * Event emitted when a Goal's target month is changed.
 */
export class GoalTargetChanged implements DomainEvent {
  readonly eventType = eventTypes.goalTargetChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      targetMonth: string; // ISO string YYYY-MM
      changedAt: Date;
    }
  ) {
    this.occurredAt = payload.changedAt;
    this.aggregateId = payload.goalId;
  }
}
