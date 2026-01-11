import { Assert } from '../shared/Assert';
import { AggregateRoot } from '../shared/AggregateRoot';
import { DomainEvent } from '../shared/DomainEvent';
import { Timestamp } from '../shared/vos/Timestamp';
import { EventId } from '../shared/vos/EventId';
import { UserId } from '../identity/UserId';
import { ScopeId } from './vos/ScopeId';
import { ScopeEpoch } from './vos/ScopeEpoch';
import { ScopeCreated } from './events/ScopeCreated';
import { ScopeMemberAdded } from './events/ScopeMemberAdded';
import { ScopeMemberRemoved } from './events/ScopeMemberRemoved';
import { ScopeEpochRotated } from './events/ScopeEpochRotated';

/**
 * Represents membership information for a Scope member.
 */
export type ScopeMember = Readonly<{
  userId: UserId;
  role: string;
  addedAt: Timestamp;
  removedAt: Timestamp | null;
}>;

export type ScopeSnapshot = {
  id: ScopeId;
  ownerUserId: UserId;
  scopeEpoch: ScopeEpoch;
  members: ScopeMember[];
  createdBy: UserId;
  createdAt: Timestamp;
  version: number;
};

/**
 * Scope aggregate root.
 *
 * Represents a cryptographic scope for key distribution and membership management.
 * Scopes enable secure sharing of resources by maintaining a membership roster
 * and rotating shared keys via epochs.
 *
 * Invariants enforced:
 * - Owner cannot be removed
 * - Epochs monotonically increase
 * - Cannot add duplicate members
 * - Only active members can be removed
 *
 * @example
 * ```typescript
 * const scope = Scope.create({
 *   id: ScopeId.create(),
 *   ownerUserId: UserId.from('user-123'),
 *   createdBy: UserId.from('user-123'),
 *   createdAt: Timestamp.now(),
 * });
 *
 * scope.addMember({
 *   memberId: UserId.from('user-456'),
 *   role: 'editor',
 *   addedAt: Timestamp.now(),
 *   actorId: UserId.from('user-123'),
 * });
 *
 * scope.rotateEpoch({
 *   reason: 'member removed',
 *   rotatedAt: Timestamp.now(),
 *   actorId: UserId.from('user-123'),
 * });
 * ```
 */
export class Scope extends AggregateRoot<ScopeId> {
  private _ownerUserId: UserId | undefined;
  private _scopeEpoch: ScopeEpoch | undefined;
  private _members: Map<string, ScopeMember> = new Map();
  private _createdBy: UserId | undefined;
  private _createdAt: Timestamp | undefined;

  private constructor(id: ScopeId) {
    super(id);
  }

  /**
   * Reconstitute a Scope from historical events.
   */
  static reconstitute(id: ScopeId, events: readonly DomainEvent[]): Scope {
    const scope = new Scope(id);
    scope.loadFromHistory(events as DomainEvent[]);
    scope.markEventsAsCommitted();
    return scope;
  }

  /**
   * Reconstitute a Scope from a persisted snapshot plus tail events.
   */
  static reconstituteFromSnapshot(snapshot: ScopeSnapshot, tailEvents: readonly DomainEvent[]): Scope {
    const scope = new Scope(snapshot.id);
    scope.hydrateFromSnapshot(snapshot);
    scope.loadFromHistory(tailEvents as DomainEvent[]);
    scope.markEventsAsCommitted();
    return scope;
  }

  /**
   * Create a new Scope.
   *
   * This is the only way to create a Scope. It emits a ScopeCreated event.
   * The owner is automatically added as a member with role 'owner'.
   */
  static create(params: { id: ScopeId; ownerUserId: UserId; createdBy: UserId; createdAt: Timestamp }): Scope {
    const scope = new Scope(params.id);

    // Create scope with initial epoch 0
    scope.apply(
      new ScopeCreated(
        {
          scopeId: params.id,
          ownerUserId: params.ownerUserId,
          scopeEpoch: ScopeEpoch.zero(),
          createdBy: params.createdBy,
          createdAt: params.createdAt,
        },
        {
          aggregateId: params.id,
          occurredAt: params.createdAt,
          eventId: EventId.create(),
          actorId: params.createdBy,
        }
      )
    );

    // Automatically add owner as first member
    scope.apply(
      new ScopeMemberAdded(
        {
          scopeId: params.id,
          memberId: params.ownerUserId,
          role: 'owner',
          addedBy: params.createdBy,
          addedAt: params.createdAt,
        },
        {
          aggregateId: params.id,
          occurredAt: params.createdAt,
          eventId: EventId.create(),
          actorId: params.createdBy,
        }
      )
    );

    return scope;
  }

  // === Getters ===

  get ownerUserId(): UserId {
    Assert.that(this._ownerUserId, 'OwnerUserId').isDefined();
    return this._ownerUserId!;
  }

  get scopeEpoch(): ScopeEpoch {
    Assert.that(this._scopeEpoch, 'ScopeEpoch').isDefined();
    return this._scopeEpoch!;
  }

  get members(): ReadonlyMap<string, ScopeMember> {
    return new Map(this._members);
  }

  get activeMembers(): ScopeMember[] {
    return Array.from(this._members.values()).filter((m) => m.removedAt === null);
  }

  get createdBy(): UserId {
    Assert.that(this._createdBy, 'CreatedBy').isDefined();
    return this._createdBy!;
  }

  get createdAt(): Timestamp {
    Assert.that(this._createdAt, 'CreatedAt').isDefined();
    return this._createdAt!;
  }

  // === Commands ===

  /**
   * Add a member to the scope.
   *
   * @throws {Error} if member is already active in the scope
   */
  addMember(params: { memberId: UserId; role: string; addedAt: Timestamp; actorId: UserId }): void {
    const existingMember = this._members.get(params.memberId.value);
    Assert.that(existingMember?.removedAt === null, 'Cannot add member: user is already an active member').isFalse();

    this.apply(
      new ScopeMemberAdded(
        {
          scopeId: this.id,
          memberId: params.memberId,
          role: params.role,
          addedBy: params.actorId,
          addedAt: params.addedAt,
        },
        {
          aggregateId: this.id,
          occurredAt: params.addedAt,
          eventId: EventId.create(),
          actorId: params.actorId,
        }
      )
    );
  }

  /**
   * Remove a member from the scope.
   *
   * @throws {Error} if member is not active or is the owner
   */
  removeMember(params: { memberId: UserId; reason: string; removedAt: Timestamp; actorId: UserId }): void {
    Assert.that(params.memberId.equals(this.ownerUserId), 'Cannot remove owner from scope').isFalse();

    const existingMember = this._members.get(params.memberId.value);
    Assert.that(existingMember, 'Member not found').isDefined();
    Assert.that(existingMember!.removedAt, 'Member is not active').isNull();

    this.apply(
      new ScopeMemberRemoved(
        {
          scopeId: this.id,
          memberId: params.memberId,
          reason: params.reason,
          removedBy: params.actorId,
          removedAt: params.removedAt,
        },
        {
          aggregateId: this.id,
          occurredAt: params.removedAt,
          eventId: EventId.create(),
          actorId: params.actorId,
        }
      )
    );
  }

  /**
   * Rotate the scope epoch.
   *
   * Epoch rotation invalidates all previous grants and forces key re-distribution.
   * Typically triggered when members are removed or security is compromised.
   */
  rotateEpoch(params: { reason: string; rotatedAt: Timestamp; actorId: UserId }): void {
    const oldEpoch = this.scopeEpoch;
    const newEpoch = oldEpoch.increment();

    this.apply(
      new ScopeEpochRotated(
        {
          scopeId: this.id,
          oldEpoch,
          newEpoch,
          reason: params.reason,
          rotatedBy: params.actorId,
          rotatedAt: params.rotatedAt,
        },
        {
          aggregateId: this.id,
          occurredAt: params.rotatedAt,
          eventId: EventId.create(),
          actorId: params.actorId,
        }
      )
    );
  }

  private hydrateFromSnapshot(snapshot: ScopeSnapshot): void {
    this._ownerUserId = snapshot.ownerUserId;
    this._scopeEpoch = snapshot.scopeEpoch;
    this._createdBy = snapshot.createdBy;
    this._createdAt = snapshot.createdAt;
    this._members = new Map(snapshot.members.map((m) => [m.userId.value, m]));
    this.restoreVersion(snapshot.version);
  }

  // === Event Handlers ===

  protected onScopeCreated(event: ScopeCreated): void {
    this._ownerUserId = event.ownerUserId;
    this._scopeEpoch = event.scopeEpoch;
    this._createdBy = event.createdBy;
    this._createdAt = event.createdAt;
  }

  protected onScopeMemberAdded(event: ScopeMemberAdded): void {
    const member: ScopeMember = {
      userId: event.memberId,
      role: event.role,
      addedAt: event.addedAt,
      removedAt: null,
    };
    this._members.set(event.memberId.value, member);
  }

  protected onScopeMemberRemoved(event: ScopeMemberRemoved): void {
    const member = this._members.get(event.memberId.value);
    if (member) {
      this._members.set(event.memberId.value, {
        ...member,
        removedAt: event.removedAt,
      });
    }
  }

  protected onScopeEpochRotated(event: ScopeEpochRotated): void {
    this._scopeEpoch = event.newEpoch;
  }
}
