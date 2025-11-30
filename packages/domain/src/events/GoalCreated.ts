import { DomainEvent } from '../shared/DomainEvent';
import { SliceValue } from '../goals/Slice';
import { PriorityLevel } from '../goals/Priority';
import { eventTypes } from './eventTypes';

/**
 * Event emitted when a new Goal is created.
 *
 * This is the first event in a Goal's lifecycle and establishes its initial state.
 */
export class GoalCreated implements DomainEvent {
  readonly eventType = eventTypes.goalCreated;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      slice: SliceValue;
      summary: string;
      targetMonth: string; // ISO string YYYY-MM
      priority: PriorityLevel;
      createdBy: string;
      createdAt: Date;
    }
  ) {
    this.occurredAt = payload.createdAt;
    this.aggregateId = payload.goalId;
  }
}
