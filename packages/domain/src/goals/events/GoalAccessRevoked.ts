import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';

export class GoalAccessRevoked implements DomainEvent {
  readonly eventType = goalEventTypes.goalAccessRevoked;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      revokedFrom: string;
      revokedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.revokedAt;
  }
}
