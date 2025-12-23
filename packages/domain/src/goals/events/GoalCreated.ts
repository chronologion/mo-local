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

export interface GoalCreatedPayload {
  goalId: GoalId;
  slice: Slice;
  summary: Summary;
  targetMonth: Month;
  priority: Priority;
  createdBy: UserId;
  createdAt: Timestamp;
}

export class GoalCreated extends DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalCreated;
  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly summary: Summary;
  readonly targetMonth: Month;
  readonly priority: Priority;
  readonly createdBy: UserId;
  readonly createdAt: Timestamp;

  constructor(public readonly payload: GoalCreatedPayload) {
    super(payload.goalId, payload.createdAt);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.summary = payload.summary;
    this.targetMonth = payload.targetMonth;
    this.priority = payload.priority;
    this.createdBy = payload.createdBy;
    this.createdAt = payload.createdAt;
    Object.freeze(this);
  }

  toJSON(): GoalCreatedJSON {
    return {
      goalId: this.payload.goalId.value,
      slice: this.payload.slice.value,
      summary: this.payload.summary.value,
      targetMonth: this.payload.targetMonth.value,
      priority: this.payload.priority.value,
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
