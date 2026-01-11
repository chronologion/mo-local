import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { payloadEventSpec, voString, stringField } from '../../shared/eventSpec';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ScopeId } from '../vos/ScopeId';
import { ScopeEpoch } from '../vos/ScopeEpoch';
import { scopeEventTypes } from './eventTypes';

export interface ScopeEpochRotatedPayload {
  scopeId: ScopeId;
  oldEpoch: ScopeEpoch;
  newEpoch: ScopeEpoch;
  reason: string;
  rotatedBy: UserId;
  rotatedAt: Timestamp;
}

export class ScopeEpochRotated extends DomainEvent<ScopeId> implements ScopeEpochRotatedPayload {
  readonly eventType = scopeEventTypes.scopeEpochRotated;
  readonly scopeId: ScopeId;
  readonly oldEpoch: ScopeEpoch;
  readonly newEpoch: ScopeEpoch;
  readonly reason: string;
  readonly rotatedBy: UserId;
  readonly rotatedAt: Timestamp;

  constructor(payload: ScopeEpochRotatedPayload, meta: EventMetadata<ScopeId>) {
    super(meta);
    this.scopeId = this.aggregateId;
    this.oldEpoch = payload.oldEpoch;
    this.newEpoch = payload.newEpoch;
    this.reason = payload.reason;
    this.rotatedBy = payload.rotatedBy;
    this.rotatedAt = this.occurredAt;
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

export const ScopeEpochRotatedSpec = payloadEventSpec<ScopeEpochRotated, ScopeEpochRotatedPayload, ScopeId>(
  scopeEventTypes.scopeEpochRotated,
  (p, meta) => new ScopeEpochRotated(p, meta),
  {
    scopeId: voString(ScopeId.from),
    oldEpoch: voBigInt(ScopeEpoch.fromString),
    newEpoch: voBigInt(ScopeEpoch.fromString),
    reason: stringField(),
    rotatedBy: voString(UserId.from),
    rotatedAt: {
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
