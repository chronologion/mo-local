import { DomainEvent } from '../shared/DomainEvent';
import { eventTypes } from './eventTypes';

export type Permission = 'owner' | 'edit' | 'view';

/**
 * Event emitted when access to a Goal is granted to a user.
 */
export class GoalAccessGranted implements DomainEvent {
  readonly eventType = eventTypes.goalAccessGranted;
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
    this.occurredAt = payload.grantedAt;
    this.aggregateId = payload.goalId;
  }
}
