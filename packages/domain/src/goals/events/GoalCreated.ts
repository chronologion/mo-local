import { DomainEvent } from '../../shared/DomainEvent';
import { Slice } from '../Slice';
import { Priority } from '../vos/Priority';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Summary } from '../vos/Summary';
import { Month } from '../vos/Month';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ToJSON } from '../../shared/serialization';

export type GoalCreatedJSON = ToJSON<GoalCreated['payload']>;

export class GoalCreated implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalCreated;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      slice: Slice;
      summary: Summary;
      targetMonth: Month;
      priority: Priority;
      createdBy: UserId;
      createdAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.createdAt;
  }

  toJSON(): GoalCreatedJSON {
    return {
      goalId: this.payload.goalId.value,
      slice: this.payload.slice.value,
      summary: this.payload.summary.value,
      targetMonth: this.payload.targetMonth.value,
      priority: this.payload.priority.level,
      createdBy: this.payload.createdBy.value,
      createdAt: this.payload.createdAt.value,
    };
  }

  static fromJSON(json: GoalCreatedJSON): GoalCreated {
    return new GoalCreated({
      goalId: GoalId.from(json.goalId),
      slice: Slice.from(json.slice),
      summary: Summary.from(json.summary),
      targetMonth: Month.from(json.targetMonth),
      priority: Priority.from(json.priority),
      createdBy: UserId.from(json.createdBy),
      createdAt: Timestamp.fromMillis(json.createdAt),
    });
  }
}
