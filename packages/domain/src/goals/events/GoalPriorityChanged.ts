import { DomainEvent } from '../../shared/DomainEvent';
import { Priority } from '../vos/Priority';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { ToJSON } from '../../shared/serialization';

export type GoalPriorityChangedJSON = ToJSON<GoalPriorityChanged['payload']>;

export class GoalPriorityChanged implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalPriorityChanged;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      priority: Priority;
      changedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.changedAt;
  }

  toJSON(): GoalPriorityChangedJSON {
    return {
      goalId: this.payload.goalId.value,
      priority: this.payload.priority.value,
      changedAt: this.payload.changedAt.value,
    };
  }

  static fromJSON(json: GoalPriorityChangedJSON): GoalPriorityChanged {
    return new GoalPriorityChanged({
      goalId: GoalId.from(json.goalId),
      priority: Priority.from(json.priority),
      changedAt: Timestamp.fromMillis(json.changedAt),
    });
  }
}
