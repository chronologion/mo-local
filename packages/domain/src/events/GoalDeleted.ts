import { DomainEvent } from '../shared/DomainEvent';

/**
 * Event emitted when a Goal is deleted (soft delete).
 */
export class GoalDeleted implements DomainEvent {
  readonly eventType = 'GoalDeleted';
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
