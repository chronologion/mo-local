import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString, stringField } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { GrantId } from '../vos/GrantId';
import { ScopeId } from '../vos/ScopeId';
import { ResourceId } from '../vos/ResourceId';
import { resourceGrantEventTypes } from './eventTypes';

export interface ResourceRevokedPayload {
  grantId: GrantId;
  scopeId: ScopeId;
  resourceId: ResourceId;
  reason: string;
  revokedBy: UserId;
  revokedAt: Timestamp;
}

export class ResourceRevoked extends DomainEvent<GrantId> implements ResourceRevokedPayload {
  readonly eventType = resourceGrantEventTypes.resourceRevoked;
  readonly grantId: GrantId;
  readonly scopeId: ScopeId;
  readonly resourceId: ResourceId;
  readonly reason: string;
  readonly revokedBy: UserId;
  readonly revokedAt: Timestamp;

  constructor(payload: ResourceRevokedPayload, meta: EventMetadata<GrantId>) {
    super(meta);
    this.grantId = this.aggregateId;
    this.scopeId = payload.scopeId;
    this.resourceId = payload.resourceId;
    this.reason = payload.reason;
    this.revokedBy = payload.revokedBy;
    this.revokedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ResourceRevokedSpec = payloadEventSpec<ResourceRevoked, ResourceRevokedPayload, GrantId>(
  resourceGrantEventTypes.resourceRevoked,
  (p, meta) => new ResourceRevoked(p, meta),
  {
    grantId: voString(GrantId.from),
    scopeId: voString(ScopeId.from),
    resourceId: voString(ResourceId.from),
    reason: stringField(),
    revokedBy: voString(UserId.from),
    revokedAt: {
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
