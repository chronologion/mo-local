import { DomainEvent } from '../shared/DomainEvent';
import { SliceValue } from '../goals/Slice';

/**
 * Event emitted when a Goal's slice (life area) is changed.
 */
export class GoalSliceChanged implements DomainEvent {
  readonly eventType = 'GoalSliceChanged';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      goalId: string;
      slice: SliceValue;
      changedAt: Date;
    }
  ) {
    this.occurredAt = payload.changedAt;
    this.aggregateId = payload.goalId;
  }
}
