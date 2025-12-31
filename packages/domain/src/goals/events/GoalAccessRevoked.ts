import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
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

  constructor(payload: GoalAccessRevokedPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.revokedFrom = payload.revokedFrom;
    this.revokedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalAccessRevokedSpec = payloadEventSpec<
  GoalAccessRevoked,
  GoalAccessRevokedPayload,
  GoalId
>(
  goalEventTypes.goalAccessRevoked,
  (p, meta) => new GoalAccessRevoked(p, meta),
  {
    goalId: voString(GoalId.from),
    revokedFrom: voString(UserId.from),
    revokedAt: voNumber(Timestamp.fromMillis),
  }
);
