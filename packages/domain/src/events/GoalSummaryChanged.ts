import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';

/**
 * Event emitted when a Goal's summary is changed.
 */
export class GoalSummaryChanged implements DomainEvent {
  readonly eventType = eventTypes.goalSummaryChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      summary: string;
      changedAt: Date;
    }
  ) {
    this.occurredAt = payload.changedAt;
    this.aggregateId = payload.goalId;
  }
}
