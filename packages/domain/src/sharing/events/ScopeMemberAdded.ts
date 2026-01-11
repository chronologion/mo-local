import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString, stringField } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ScopeId } from '../vos/ScopeId';
import { scopeEventTypes } from './eventTypes';

export interface ScopeMemberAddedPayload {
  scopeId: ScopeId;
  memberId: UserId;
  role: string;
  addedBy: UserId;
  addedAt: Timestamp;
}

export class ScopeMemberAdded extends DomainEvent<ScopeId> implements ScopeMemberAddedPayload {
  readonly eventType = scopeEventTypes.scopeMemberAdded;
  readonly scopeId: ScopeId;
  readonly memberId: UserId;
  readonly role: string;
  readonly addedBy: UserId;
  readonly addedAt: Timestamp;

  constructor(payload: ScopeMemberAddedPayload, meta: EventMetadata<ScopeId>) {
    super(meta);
    this.scopeId = this.aggregateId;
    this.memberId = payload.memberId;
    this.role = payload.role;
    this.addedBy = payload.addedBy;
    this.addedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ScopeMemberAddedSpec = payloadEventSpec<ScopeMemberAdded, ScopeMemberAddedPayload, ScopeId>(
  scopeEventTypes.scopeMemberAdded,
  (p, meta) => new ScopeMemberAdded(p, meta),
  {
    scopeId: voString(ScopeId.from),
    memberId: voString(UserId.from),
    role: stringField(),
    addedBy: voString(UserId.from),
    addedAt: {
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
