import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString, stringField } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ScopeId } from '../vos/ScopeId';
import { scopeEventTypes } from './eventTypes';

export interface ScopeMemberRemovedPayload {
  scopeId: ScopeId;
  memberId: UserId;
  reason: string;
  removedBy: UserId;
  removedAt: Timestamp;
}

export class ScopeMemberRemoved extends DomainEvent<ScopeId> implements ScopeMemberRemovedPayload {
  readonly eventType = scopeEventTypes.scopeMemberRemoved;
  readonly scopeId: ScopeId;
  readonly memberId: UserId;
  readonly reason: string;
  readonly removedBy: UserId;
  readonly removedAt: Timestamp;

  constructor(payload: ScopeMemberRemovedPayload, meta: EventMetadata<ScopeId>) {
    super(meta);
    this.scopeId = this.aggregateId;
    this.memberId = payload.memberId;
    this.reason = payload.reason;
    this.removedBy = payload.removedBy;
    this.removedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ScopeMemberRemovedSpec = payloadEventSpec<ScopeMemberRemoved, ScopeMemberRemovedPayload, ScopeId>(
  scopeEventTypes.scopeMemberRemoved,
  (p, meta) => new ScopeMemberRemoved(p, meta),
  {
    scopeId: voString(ScopeId.from),
    memberId: voString(UserId.from),
    reason: stringField(),
    removedBy: voString(UserId.from),
    removedAt: {
      encode: (v) => v.value,
      decode: (u) => {
        if (typeof u !== 'number' || !Number.isFinite(u)) {
          throw new Error('Expected finite number for timestamp');
        }
        return Timestamp.fromMillis(u);
      },
    },
  }
);
