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

  constructor(payload: UserRegisteredPayload, meta: EventMetadata<UserId>) {
    super(meta);
    this.userId = this.aggregateId;
    this.registeredAt = this.occurredAt;
    Object.freeze(this);
  }
}
