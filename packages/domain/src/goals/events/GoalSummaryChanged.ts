import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Summary } from '../vos/Summary';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ToJSON } from '../../shared/serialization';

export type GoalSummaryChangedJSON = ToJSON<GoalSummaryChanged['payload']>;

export class GoalSummaryChanged implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalSummaryChanged;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      summary: Summary;
      changedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.changedAt;
  }

  toJSON(): GoalSummaryChangedJSON {
    return {
      goalId: this.payload.goalId.value,
      summary: this.payload.summary.value,
      changedAt: this.payload.changedAt.value,
    };
  }

  static fromJSON(json: GoalSummaryChangedJSON): GoalSummaryChanged {
    return new GoalSummaryChanged({
      goalId: GoalId.from(json.goalId),
      summary: Summary.from(json.summary),
      changedAt: Timestamp.fromMillis(json.changedAt),
    });
  }
}
