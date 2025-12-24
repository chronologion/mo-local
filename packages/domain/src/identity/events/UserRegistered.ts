import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { UserId } from '../UserId';
import { Timestamp } from '../../shared/vos/Timestamp';

export interface UserRegisteredPayload {
  userId: UserId;
  registeredAt: Timestamp;
}

export class UserRegistered
  extends DomainEvent<UserId>
  implements UserRegisteredPayload
{
  readonly eventType = 'UserRegistered';
  readonly userId: UserId;
  readonly registeredAt: Timestamp;

  constructor(payload: UserRegisteredPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.userId,
      occurredAt: payload.registeredAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.userId = payload.userId;
    this.registeredAt = payload.registeredAt;
    Object.freeze(this);
  }
}
