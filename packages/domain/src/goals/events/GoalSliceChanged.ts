import { DomainEvent } from '../../shared/DomainEvent';
import { SliceValue } from '../Slice';
import { goalEventTypes } from './eventTypes';

export class GoalSliceChanged implements DomainEvent {
  readonly eventType = goalEventTypes.goalSliceChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      slice: SliceValue;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.goalId;
    this.occurredAt = payload.changedAt;
  }
}
