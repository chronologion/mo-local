import { Assert } from '../shared/Assert';
import { AggregateRoot } from '../shared/AggregateRoot';
import { DomainEvent } from '../shared/DomainEvent';
import { Timestamp } from '../shared/vos/Timestamp';
import { EventId } from '../shared/vos/EventId';
import { UserId } from '../identity/UserId';
import { GrantId } from './vos/GrantId';
import { ScopeId } from './vos/ScopeId';
import { ResourceId } from './vos/ResourceId';
import { ScopeEpoch } from './vos/ScopeEpoch';
import { ResourceGranted } from './events/ResourceGranted';
import { ResourceRevoked } from './events/ResourceRevoked';

export type GrantStatus = 'active' | 'revoked';

export type ResourceGrantSnapshot = {
  id: GrantId;
  scopeId: ScopeId;
  resourceId: ResourceId;
  scopeEpoch: ScopeEpoch;
  resourceKeyId: string;
  wrappedKey: Uint8Array;
  status: GrantStatus;
  grantedBy: UserId;
  grantedAt: Timestamp;
  revokedBy: UserId | null;
  revokedAt: Timestamp | null;
  version: number;
};

/**
 * ResourceGrant aggregate root.
 *
 * Represents the binding of a resource (Goal, Project, etc.) to a Scope,
 * including the wrapped resource encryption key. Grants can be revoked,
 * which invalidates access for all scope members.
 *
 * Invariants enforced:
 * - Cannot revoke an already revoked grant
 * - WrappedKey cannot be empty
 * - ResourceKeyId must be non-empty
 *
 * @example
 * ```typescript
 * const grant = ResourceGrant.create({
 *   id: GrantId.create(),
 *   scopeId: ScopeId.from('scope-123'),
 *   resourceId: ResourceId.from('goal-456'),
 *   scopeEpoch: ScopeEpoch.from(1n),
 *   resourceKeyId: 'key-789',
 *   wrappedKey: new Uint8Array([...]),
 *   grantedBy: UserId.from('user-123'),
 *   grantedAt: Timestamp.now(),
 * });
 *
 * grant.revoke({
 *   reason: 'resource archived',
 *   revokedAt: Timestamp.now(),
 *   actorId: UserId.from('user-123'),
 * });
 * ```
 */
export class ResourceGrant extends AggregateRoot<GrantId> {
  private _scopeId: ScopeId | undefined;
  private _resourceId: ResourceId | undefined;
  private _scopeEpoch: ScopeEpoch | undefined;
  private _resourceKeyId: string | undefined;
  private _wrappedKey: Uint8Array | undefined;
  private _status: GrantStatus = 'active';
  private _grantedBy: UserId | undefined;
  private _grantedAt: Timestamp | undefined;
  private _revokedBy: UserId | null = null;
  private _revokedAt: Timestamp | null = null;

  private constructor(id: GrantId) {
    super(id);
  }

  /**
   * Reconstitute a ResourceGrant from historical events.
   */
  static reconstitute(id: GrantId, events: readonly DomainEvent[]): ResourceGrant {
    const grant = new ResourceGrant(id);
    grant.loadFromHistory(events as DomainEvent[]);
    grant.markEventsAsCommitted();
    return grant;
  }

  /**
   * Reconstitute a ResourceGrant from a persisted snapshot plus tail events.
   */
  static reconstituteFromSnapshot(snapshot: ResourceGrantSnapshot, tailEvents: readonly DomainEvent[]): ResourceGrant {
    const grant = new ResourceGrant(snapshot.id);
    grant.hydrateFromSnapshot(snapshot);
    grant.loadFromHistory(tailEvents as DomainEvent[]);
    grant.markEventsAsCommitted();
    return grant;
  }

  /**
   * Create a new ResourceGrant.
   *
   * This is the only way to create a ResourceGrant. It emits a ResourceGranted event.
   *
   * @param params.wrappedKey - The resource encryption key wrapped under the scope's shared key (K_resource wrapped under K_scope)
   * @param params.resourceKeyId - Identifier for the resource key (e.g., key fingerprint or version)
   * @param params.scopeEpoch - The scope epoch at the time of grant creation (must match current scope epoch)
   */
  static create(params: {
    id: GrantId;
    scopeId: ScopeId;
    resourceId: ResourceId;
    scopeEpoch: ScopeEpoch;
    resourceKeyId: string;
    wrappedKey: Uint8Array;
    grantedBy: UserId;
    grantedAt: Timestamp;
  }): ResourceGrant {
    Assert.that(params.resourceKeyId, 'ResourceKeyId').isNonEmpty();
    Assert.that(params.wrappedKey.length > 0, 'WrappedKey cannot be empty').isTrue();

    const grant = new ResourceGrant(params.id);
    grant.apply(
      new ResourceGranted(
        {
          grantId: params.id,
          scopeId: params.scopeId,
          resourceId: params.resourceId,
          scopeEpoch: params.scopeEpoch,
          resourceKeyId: params.resourceKeyId,
          wrappedKey: params.wrappedKey,
          grantedBy: params.grantedBy,
          grantedAt: params.grantedAt,
        },
        {
          aggregateId: params.id,
          occurredAt: params.grantedAt,
          eventId: EventId.create(),
          actorId: params.grantedBy,
        }
      )
    );

    return grant;
  }

  // === Getters ===

  get scopeId(): ScopeId {
    Assert.that(this._scopeId, 'ScopeId').isDefined();
    return this._scopeId!;
  }

  get resourceId(): ResourceId {
    Assert.that(this._resourceId, 'ResourceId').isDefined();
    return this._resourceId!;
  }

  get scopeEpoch(): ScopeEpoch {
    Assert.that(this._scopeEpoch, 'ScopeEpoch').isDefined();
    return this._scopeEpoch!;
  }

  get resourceKeyId(): string {
    Assert.that(this._resourceKeyId, 'ResourceKeyId').isDefined();
    return this._resourceKeyId!;
  }

  get wrappedKey(): Uint8Array {
    Assert.that(this._wrappedKey, 'WrappedKey').isDefined();
    return this._wrappedKey!;
  }

  get status(): GrantStatus {
    return this._status;
  }

  get isActive(): boolean {
    return this._status === 'active';
  }

  get isRevoked(): boolean {
    return this._status === 'revoked';
  }

  get grantedBy(): UserId {
    Assert.that(this._grantedBy, 'GrantedBy').isDefined();
    return this._grantedBy!;
  }

  get grantedAt(): Timestamp {
    Assert.that(this._grantedAt, 'GrantedAt').isDefined();
    return this._grantedAt!;
  }

  get revokedBy(): UserId | null {
    return this._revokedBy;
  }

  get revokedAt(): Timestamp | null {
    return this._revokedAt;
  }

  // === Commands ===

  /**
   * Revoke the grant.
   *
   * Once revoked, the grant becomes permanently inactive. Revoking a grant
   * invalidates access for all scope members.
   *
   * @throws {Error} if grant is already revoked
   */
  revoke(params: { reason: string; revokedAt: Timestamp; actorId: UserId }): void {
    Assert.that(this.isRevoked, 'Cannot revoke: grant is already revoked').isFalse();

    this.apply(
      new ResourceRevoked(
        {
          grantId: this.id,
          scopeId: this.scopeId,
          resourceId: this.resourceId,
          reason: params.reason,
          revokedBy: params.actorId,
          revokedAt: params.revokedAt,
        },
        {
          aggregateId: this.id,
          occurredAt: params.revokedAt,
          eventId: EventId.create(),
          actorId: params.actorId,
        }
      )
    );
  }

  private hydrateFromSnapshot(snapshot: ResourceGrantSnapshot): void {
    this._scopeId = snapshot.scopeId;
    this._resourceId = snapshot.resourceId;
    this._scopeEpoch = snapshot.scopeEpoch;
    this._resourceKeyId = snapshot.resourceKeyId;
    this._wrappedKey = snapshot.wrappedKey;
    this._status = snapshot.status;
    this._grantedBy = snapshot.grantedBy;
    this._grantedAt = snapshot.grantedAt;
    this._revokedBy = snapshot.revokedBy;
    this._revokedAt = snapshot.revokedAt;
    this.restoreVersion(snapshot.version);
  }

  // === Event Handlers ===

  protected onResourceGranted(event: ResourceGranted): void {
    this._scopeId = event.scopeId;
    this._resourceId = event.resourceId;
    this._scopeEpoch = event.scopeEpoch;
    this._resourceKeyId = event.resourceKeyId;
    this._wrappedKey = event.wrappedKey;
    this._status = 'active';
    this._grantedBy = event.grantedBy;
    this._grantedAt = event.grantedAt;
  }

  protected onResourceRevoked(event: ResourceRevoked): void {
    this._status = 'revoked';
    this._revokedBy = event.revokedBy;
    this._revokedAt = event.revokedAt;
  }
}
