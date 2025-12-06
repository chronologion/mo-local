import { DomainEvent } from '../../shared/DomainEvent';
import { Permission } from '../../goals/AccessEntry';
import { goalEventTypes } from './eventTypes';

export class GoalAccessGranted implements DomainEvent {
  readonly eventType = goalEventTypes.goalAccessGranted;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      grantedTo: string;
      permission: Permission;
      grantedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.grantedAt;
  }
}
