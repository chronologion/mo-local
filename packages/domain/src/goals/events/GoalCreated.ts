import { DomainEvent } from '../../shared/DomainEvent';
import { SliceValue } from '../Slice';
import { PriorityLevel } from '../Priority';
import { goalEventTypes } from './eventTypes';

export class GoalCreated implements DomainEvent {
  readonly eventType = goalEventTypes.goalCreated;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      slice: SliceValue;
      summary: string;
      targetMonth: string;
      priority: PriorityLevel;
      createdBy: string;
      createdAt: Date;
    }
  ) {
    this.occurredAt = payload.createdAt;
    this.aggregateId = payload.goalId;
  }
}
