import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';

/**
 * Event emitted when access to a Goal is revoked from a user.
 */
export class GoalAccessRevoked implements DomainEvent {
  readonly eventType = eventTypes.goalAccessRevoked;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      revokedFrom: string;
      revokedAt: Date;
    }
  ) {
    this.occurredAt = payload.revokedAt;
    this.aggregateId = payload.goalId;
  }
}
