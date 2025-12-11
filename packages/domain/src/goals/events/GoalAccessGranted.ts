import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { Permission } from '../vos/Permission';
import { ToJSON } from '../../shared/serialization';

export type GoalAccessGrantedJSON = ToJSON<GoalAccessGranted['payload']>;

export class GoalAccessGranted implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalAccessGranted;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      grantedTo: UserId;
      permission: Permission;
      grantedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.grantedAt;
  }

  toJSON(): GoalAccessGrantedJSON {
    return {
      goalId: this.payload.goalId.value,
      grantedTo: this.payload.grantedTo.value,
      permission: this.payload.permission.value,
      grantedAt: this.payload.grantedAt.value,
    };
  }

  static fromJSON(json: GoalAccessGrantedJSON): GoalAccessGranted {
    return new GoalAccessGranted({
      goalId: GoalId.from(json.goalId),
      grantedTo: UserId.from(json.grantedTo),
      permission: Permission.from(json.permission),
      grantedAt: Timestamp.fromMillis(json.grantedAt),
    });
  }
}
