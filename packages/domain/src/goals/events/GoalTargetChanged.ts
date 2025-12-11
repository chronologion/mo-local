import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { Month } from '../vos/Month';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ToJSON } from '../../shared/serialization';

export type GoalTargetChangedJSON = ToJSON<GoalTargetChanged['payload']>;

export class GoalTargetChanged implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalTargetChanged;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      targetMonth: Month;
      changedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.changedAt;
  }

  toJSON(): GoalTargetChangedJSON {
    return {
      goalId: this.payload.goalId.value,
      targetMonth: this.payload.targetMonth.value,
      changedAt: this.payload.changedAt.value,
    };
  }

  static fromJSON(json: GoalTargetChangedJSON): GoalTargetChanged {
    return new GoalTargetChanged({
      goalId: GoalId.from(json.goalId),
      targetMonth: Month.from(json.targetMonth),
      changedAt: Timestamp.fromMillis(json.changedAt),
    });
  }
}
