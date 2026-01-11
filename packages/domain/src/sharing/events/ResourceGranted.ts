import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString, stringField } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { GrantId } from '../vos/GrantId';
import { ScopeId } from '../vos/ScopeId';
import { ResourceId } from '../vos/ResourceId';
import { ScopeEpoch } from '../vos/ScopeEpoch';
import { resourceGrantEventTypes } from './eventTypes';

export interface ResourceGrantedPayload {
  grantId: GrantId;
  scopeId: ScopeId;
  resourceId: ResourceId;
  scopeEpoch: ScopeEpoch;
  resourceKeyId: string;
  wrappedKey: Uint8Array;
  grantedBy: UserId;
  grantedAt: Timestamp;
}

export class ResourceGranted extends DomainEvent<GrantId> implements ResourceGrantedPayload {
  readonly eventType = resourceGrantEventTypes.resourceGranted;
  readonly grantId: GrantId;
  readonly scopeId: ScopeId;
  readonly resourceId: ResourceId;
  readonly scopeEpoch: ScopeEpoch;
  readonly resourceKeyId: string;
  readonly wrappedKey: Uint8Array;
  readonly grantedBy: UserId;
  readonly grantedAt: Timestamp;

  constructor(payload: ResourceGrantedPayload, meta: EventMetadata<GrantId>) {
    super(meta);
    this.grantId = this.aggregateId;
    this.scopeId = payload.scopeId;
    this.resourceId = payload.resourceId;
    this.scopeEpoch = payload.scopeEpoch;
    this.resourceKeyId = payload.resourceKeyId;
    this.wrappedKey = payload.wrappedKey;
    this.grantedBy = payload.grantedBy;
    this.grantedAt = this.occurredAt;
    Object.freeze(this);
  }
}

/**
 * Field mapper for ScopeEpoch (bigint-based VO).
 */
function voBigInt<T extends { readonly value: bigint; toString(): string }>(
  from: (s: string) => T
): {
  encode: (v: T) => string;
  decode: (u: unknown) => T;
} {
  return {
    encode: (v) => v.toString(),
    decode: (u) => {
      if (typeof u !== 'string') {
        throw new Error('Expected string representation of bigint');
      }
      return from(u);
    },
  };
}

/**
 * Field mapper for Uint8Array (base64-encoded in JSON).
 */
function uint8ArrayField(): {
  encode: (v: Uint8Array) => string;
  decode: (u: unknown) => Uint8Array;
} {
  return {
    encode: (v) => Buffer.from(v).toString('base64'),
    decode: (u) => {
      if (typeof u !== 'string') {
        throw new Error('Expected base64 string for Uint8Array');
      }
      return new Uint8Array(Buffer.from(u, 'base64'));
    },
  };
}

export const ResourceGrantedSpec = payloadEventSpec<ResourceGranted, ResourceGrantedPayload, GrantId>(
  resourceGrantEventTypes.resourceGranted,
  (p, meta) => new ResourceGranted(p, meta),
  {
    grantId: voString(GrantId.from),
    scopeId: voString(ScopeId.from),
    resourceId: voString(ResourceId.from),
    scopeEpoch: voBigInt(ScopeEpoch.fromString),
    resourceKeyId: stringField(),
    wrappedKey: uint8ArrayField(),
    grantedBy: voString(UserId.from),
    grantedAt: {
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
