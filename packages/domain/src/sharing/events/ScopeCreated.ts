import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ScopeId } from '../vos/ScopeId';
import { ScopeEpoch } from '../vos/ScopeEpoch';
import { scopeEventTypes } from './eventTypes';

export interface ScopeCreatedPayload {
  scopeId: ScopeId;
  ownerUserId: UserId;
  scopeEpoch: ScopeEpoch;
  createdBy: UserId;
  createdAt: Timestamp;
}

export class ScopeCreated extends DomainEvent<ScopeId> implements ScopeCreatedPayload {
  readonly eventType = scopeEventTypes.scopeCreated;
  readonly scopeId: ScopeId;
  readonly ownerUserId: UserId;
  readonly scopeEpoch: ScopeEpoch;
  readonly createdBy: UserId;
  readonly createdAt: Timestamp;

  constructor(payload: ScopeCreatedPayload, meta: EventMetadata<ScopeId>) {
    super(meta);
    this.scopeId = this.aggregateId;
    this.ownerUserId = payload.ownerUserId;
    this.scopeEpoch = payload.scopeEpoch;
    this.createdBy = payload.createdBy;
    this.createdAt = this.occurredAt;
    Object.freeze(this);
  }
}

/**
 * Field mapper for ScopeEpoch (bigint-based VO).
 * Encodes as string to preserve precision in JSON.
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

export const ScopeCreatedSpec = payloadEventSpec<ScopeCreated, ScopeCreatedPayload, ScopeId>(
  scopeEventTypes.scopeCreated,
  (p, meta) => new ScopeCreated(p, meta),
  {
    scopeId: voString(ScopeId.from),
    ownerUserId: voString(UserId.from),
    scopeEpoch: voBigInt(ScopeEpoch.fromString),
    createdBy: voString(UserId.from),
    createdAt: {
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
