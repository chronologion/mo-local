import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalAccessRevokedPayload {
  goalId: GoalId;
  revokedFrom: UserId;
  revokedAt: Timestamp;
}

export class GoalAccessRevoked
  extends DomainEvent<GoalId>
  implements GoalAccessRevokedPayload
{
  readonly eventType = goalEventTypes.goalAccessRevoked;

  readonly goalId: GoalId;
  readonly revokedFrom: UserId;
  readonly revokedAt: Timestamp;

  constructor(payload: GoalAccessRevokedPayload) {
    super(payload.goalId, payload.revokedAt);
    this.goalId = payload.goalId;
    this.revokedFrom = payload.revokedFrom;
    this.revokedAt = payload.revokedAt;
    Object.freeze(this);
  }
}

export const GoalAccessRevokedSpec = payloadEventSpec<
  GoalAccessRevoked,
  GoalAccessRevokedPayload
>(goalEventTypes.goalAccessRevoked, (p) => new GoalAccessRevoked(p), {
  goalId: voString(GoalId.from),
  revokedFrom: voString(UserId.from),
  revokedAt: voNumber(Timestamp.fromMillis),
});
