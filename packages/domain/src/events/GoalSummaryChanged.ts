import { DomainEvent } from '../shared/DomainEvent';

/**
 * Event emitted when a Goal's summary is changed.
 */
export class GoalSummaryChanged implements DomainEvent {
  readonly eventType = 'GoalSummaryChanged';
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
