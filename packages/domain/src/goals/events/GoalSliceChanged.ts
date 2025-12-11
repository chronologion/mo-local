import { DomainEvent } from '../../shared/DomainEvent';
import { Slice } from '../Slice';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { ToJSON } from '../../shared/serialization';

export type GoalSliceChangedJSON = ToJSON<GoalSliceChanged['payload']>;

export class GoalSliceChanged implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalSliceChanged;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      slice: Slice;
      changedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.changedAt;
  }

  toJSON(): GoalSliceChangedJSON {
    return {
      goalId: this.payload.goalId.value,
      slice: this.payload.slice.value,
      changedAt: this.payload.changedAt.value,
    };
  }

  static fromJSON(json: GoalSliceChangedJSON): GoalSliceChanged {
    return new GoalSliceChanged({
      goalId: GoalId.from(json.goalId),
      slice: Slice.from(json.slice),
      changedAt: Timestamp.fromMillis(json.changedAt),
    });
  }
}
