import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ToJSON } from '../../shared/serialization';

export type GoalAccessRevokedJSON = ToJSON<GoalAccessRevoked['payload']>;

export class GoalAccessRevoked implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalAccessRevoked;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      revokedFrom: UserId;
      revokedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.revokedAt;
  }

  toJSON(): GoalAccessRevokedJSON {
    return {
      goalId: this.payload.goalId.value,
      revokedFrom: this.payload.revokedFrom.value,
      revokedAt: this.payload.revokedAt.value,
    };
  }

  static fromJSON(json: GoalAccessRevokedJSON): GoalAccessRevoked {
    return new GoalAccessRevoked({
      goalId: GoalId.from(json.goalId),
      revokedFrom: UserId.from(json.revokedFrom),
      revokedAt: Timestamp.fromMillis(json.revokedAt),
    });
  }
}
