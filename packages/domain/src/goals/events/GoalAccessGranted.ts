import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { Permission } from '../vos/Permission';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalAccessGrantedPayload {
  goalId: GoalId;
  grantedTo: UserId;
  permission: Permission;
  grantedAt: Timestamp;
}

export class GoalAccessGranted
  extends DomainEvent<GoalId>
  implements GoalAccessGrantedPayload
{
  readonly eventType = goalEventTypes.goalAccessGranted;

  readonly goalId: GoalId;
  readonly grantedTo: UserId;
  readonly permission: Permission;
  readonly grantedAt: Timestamp;

  constructor(payload: GoalAccessGrantedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.grantedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.grantedTo = payload.grantedTo;
    this.permission = payload.permission;
    this.grantedAt = payload.grantedAt;
    Object.freeze(this);
  }
}

export const GoalAccessGrantedSpec = payloadEventSpec<
  GoalAccessGranted,
  GoalAccessGrantedPayload
>(
  goalEventTypes.goalAccessGranted,
  (p, meta) => new GoalAccessGranted(p, meta),
  {
    goalId: voString(GoalId.from),
    grantedTo: voString(UserId.from),
    permission: voString(Permission.from),
    grantedAt: voNumber(Timestamp.fromMillis),
  }
);
