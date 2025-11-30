import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';

/**
 * Event emitted when a Goal is deleted (soft delete).
 */
export class GoalDeleted implements DomainEvent {
  readonly eventType = eventTypes.goalDeleted;
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
