import { describe, it, expect, beforeEach } from 'vitest';
import { Scope } from '../../src/sharing/Scope';
import { ScopeId } from '../../src/sharing/vos/ScopeId';
import { ScopeEpoch } from '../../src/sharing/vos/ScopeEpoch';
import { UserId } from '../../src/identity/UserId';
import { Timestamp } from '../../src/shared/vos/Timestamp';
import { ScopeCreated } from '../../src/sharing/events/ScopeCreated';
import { ScopeMemberAdded } from '../../src/sharing/events/ScopeMemberAdded';
import { ScopeMemberRemoved } from '../../src/sharing/events/ScopeMemberRemoved';
import { ScopeEpochRotated } from '../../src/sharing/events/ScopeEpochRotated';
import { EventId } from '../../src/shared/vos/EventId';

describe('Scope', () => {
  const scopeId = ScopeId.create();
  const ownerUserId = UserId.from('owner-123');
  const memberUserId = UserId.from('member-456');
  const now = Timestamp.fromMillis(1_700_000_000_000);

  describe('create', () => {
    it('should create new scope with initial epoch 0', () => {
      const scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });

      expect(scope.id.equals(scopeId)).toBe(true);
      expect(scope.ownerUserId.equals(ownerUserId)).toBe(true);
      expect(scope.scopeEpoch.value).toBe(0n);
      expect(scope.createdBy.equals(ownerUserId)).toBe(true);
      expect(scope.createdAt.equals(now)).toBe(true);
    });

    it('should emit ScopeCreated event', () => {
      const scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });

      const events = scope.getUncommittedEvents();
      expect(events).toHaveLength(2); // ScopeCreated + ScopeMemberAdded (owner)
      expect(events[0]).toBeInstanceOf(ScopeCreated);

      const scopeCreated = events[0] as ScopeCreated;
      expect(scopeCreated.scopeId.equals(scopeId)).toBe(true);
      expect(scopeCreated.ownerUserId.equals(ownerUserId)).toBe(true);
      expect(scopeCreated.scopeEpoch.value).toBe(0n);
    });

    it('should automatically add owner as first member with role "owner"', () => {
      const scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });

      expect(scope.activeMembers).toHaveLength(1);
      const ownerMember = scope.activeMembers[0];
      expect(ownerMember.userId.equals(ownerUserId)).toBe(true);
      expect(ownerMember.role).toBe('owner');
      expect(ownerMember.removedAt).toBeNull();
    });

    it('should emit ScopeMemberAdded event for owner', () => {
      const scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });

      const events = scope.getUncommittedEvents();
      expect(events[1]).toBeInstanceOf(ScopeMemberAdded);

      const memberAdded = events[1] as ScopeMemberAdded;
      expect(memberAdded.memberId.equals(ownerUserId)).toBe(true);
      expect(memberAdded.role).toBe('owner');
    });
  });

  describe('addMember', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });
      scope.markEventsAsCommitted();
    });

    it('should add new member successfully', () => {
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.activeMembers).toHaveLength(2);
      const member = Array.from(scope.members.values()).find((m) => m.userId.equals(memberUserId));
      expect(member).toBeDefined();
      expect(member!.role).toBe('editor');
      expect(member!.removedAt).toBeNull();
    });

    it('should emit ScopeMemberAdded event', () => {
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });

      const events = scope.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ScopeMemberAdded);

      const event = events[0] as ScopeMemberAdded;
      expect(event.memberId.equals(memberUserId)).toBe(true);
      expect(event.role).toBe('editor');
      expect(event.addedBy.equals(ownerUserId)).toBe(true);
    });

    it('should throw error when adding duplicate active member', () => {
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });

      expect(() => {
        scope.addMember({
          memberId: memberUserId,
          role: 'viewer',
          addedAt: now,
          actorId: ownerUserId,
        });
      }).toThrow('Cannot add member: user is already an active member');
    });

    it('should allow re-adding removed member', () => {
      // Add member
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });

      // Remove member
      scope.removeMember({
        memberId: memberUserId,
        reason: 'test',
        removedAt: now,
        actorId: ownerUserId,
      });

      // Re-add member (should succeed)
      expect(() => {
        scope.addMember({
          memberId: memberUserId,
          role: 'viewer',
          addedAt: now,
          actorId: ownerUserId,
        });
      }).not.toThrow();

      expect(scope.activeMembers).toHaveLength(2);
    });
  });

  describe('removeMember', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });
      scope.markEventsAsCommitted();
    });

    it('should remove member successfully', () => {
      scope.removeMember({
        memberId: memberUserId,
        reason: 'user requested',
        removedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.activeMembers).toHaveLength(1); // Only owner remains
      const member = Array.from(scope.members.values()).find((m) => m.userId.equals(memberUserId));
      expect(member).toBeDefined();
      expect(member!.removedAt).not.toBeNull();
    });

    it('should emit ScopeMemberRemoved event', () => {
      scope.removeMember({
        memberId: memberUserId,
        reason: 'user requested',
        removedAt: now,
        actorId: ownerUserId,
      });

      const events = scope.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ScopeMemberRemoved);

      const event = events[0] as ScopeMemberRemoved;
      expect(event.memberId.equals(memberUserId)).toBe(true);
      expect(event.reason).toBe('user requested');
      expect(event.removedBy.equals(ownerUserId)).toBe(true);
    });

    it('should throw error when removing owner', () => {
      expect(() => {
        scope.removeMember({
          memberId: ownerUserId,
          reason: 'test',
          removedAt: now,
          actorId: ownerUserId,
        });
      }).toThrow('Cannot remove owner from scope');
    });

    it('should throw error when removing non-existent member', () => {
      const nonExistentUserId = UserId.from('non-existent');

      expect(() => {
        scope.removeMember({
          memberId: nonExistentUserId,
          reason: 'test',
          removedAt: now,
          actorId: ownerUserId,
        });
      }).toThrow('Member not found');
    });

    it('should throw error when removing already removed member', () => {
      scope.removeMember({
        memberId: memberUserId,
        reason: 'first removal',
        removedAt: now,
        actorId: ownerUserId,
      });

      expect(() => {
        scope.removeMember({
          memberId: memberUserId,
          reason: 'second removal',
          removedAt: now,
          actorId: ownerUserId,
        });
      }).toThrow('Member is not active');
    });
  });

  describe('rotateEpoch', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });
      scope.markEventsAsCommitted();
    });

    it('should increment epoch', () => {
      const oldEpoch = scope.scopeEpoch;

      scope.rotateEpoch({
        reason: 'member removed',
        rotatedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.scopeEpoch.value).toBe(oldEpoch.value + 1n);
    });

    it('should emit ScopeEpochRotated event', () => {
      const oldEpoch = scope.scopeEpoch;

      scope.rotateEpoch({
        reason: 'member removed',
        rotatedAt: now,
        actorId: ownerUserId,
      });

      const events = scope.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ScopeEpochRotated);

      const event = events[0] as ScopeEpochRotated;
      expect(event.oldEpoch.equals(oldEpoch)).toBe(true);
      expect(event.newEpoch.value).toBe(oldEpoch.value + 1n);
      expect(event.reason).toBe('member removed');
      expect(event.rotatedBy.equals(ownerUserId)).toBe(true);
    });

    it('should support multiple epoch rotations', () => {
      scope.rotateEpoch({
        reason: 'first rotation',
        rotatedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.scopeEpoch.value).toBe(1n);

      scope.rotateEpoch({
        reason: 'second rotation',
        rotatedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.scopeEpoch.value).toBe(2n);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute scope from events', () => {
      const events = [
        new ScopeCreated(
          {
            scopeId,
            ownerUserId,
            scopeEpoch: ScopeEpoch.zero(),
            createdBy: ownerUserId,
            createdAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberAdded(
          {
            scopeId,
            memberId: ownerUserId,
            role: 'owner',
            addedBy: ownerUserId,
            addedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberAdded(
          {
            scopeId,
            memberId: memberUserId,
            role: 'editor',
            addedBy: ownerUserId,
            addedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
      ];

      const scope = Scope.reconstitute(scopeId, events);

      expect(scope.id.equals(scopeId)).toBe(true);
      expect(scope.ownerUserId.equals(ownerUserId)).toBe(true);
      expect(scope.scopeEpoch.value).toBe(0n);
      expect(scope.activeMembers).toHaveLength(2);
      expect(scope.getUncommittedEvents()).toHaveLength(0); // Events are committed
    });

    it('should reconstitute scope with removed members', () => {
      const events = [
        new ScopeCreated(
          {
            scopeId,
            ownerUserId,
            scopeEpoch: ScopeEpoch.zero(),
            createdBy: ownerUserId,
            createdAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberAdded(
          {
            scopeId,
            memberId: ownerUserId,
            role: 'owner',
            addedBy: ownerUserId,
            addedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberAdded(
          {
            scopeId,
            memberId: memberUserId,
            role: 'editor',
            addedBy: ownerUserId,
            addedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberRemoved(
          {
            scopeId,
            memberId: memberUserId,
            reason: 'test removal',
            removedBy: ownerUserId,
            removedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
      ];

      const scope = Scope.reconstitute(scopeId, events);

      expect(scope.activeMembers).toHaveLength(1); // Only owner
      expect(scope.members.size).toBe(2); // Both owner and removed member in map
    });

    it('should reconstitute scope with rotated epoch', () => {
      const events = [
        new ScopeCreated(
          {
            scopeId,
            ownerUserId,
            scopeEpoch: ScopeEpoch.zero(),
            createdBy: ownerUserId,
            createdAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeMemberAdded(
          {
            scopeId,
            memberId: ownerUserId,
            role: 'owner',
            addedBy: ownerUserId,
            addedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
        new ScopeEpochRotated(
          {
            scopeId,
            oldEpoch: ScopeEpoch.zero(),
            newEpoch: ScopeEpoch.from(1n),
            reason: 'test rotation',
            rotatedBy: ownerUserId,
            rotatedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
      ];

      const scope = Scope.reconstitute(scopeId, events);

      expect(scope.scopeEpoch.value).toBe(1n);
    });
  });

  describe('reconstituteFromSnapshot', () => {
    it('should reconstitute from snapshot with no tail events', () => {
      const snapshot = {
        id: scopeId,
        ownerUserId,
        scopeEpoch: ScopeEpoch.from(2n),
        members: [
          {
            userId: ownerUserId,
            role: 'owner',
            addedAt: now,
            removedAt: null,
          },
          {
            userId: memberUserId,
            role: 'editor',
            addedAt: now,
            removedAt: null,
          },
        ],
        createdBy: ownerUserId,
        createdAt: now,
        version: 5,
      };

      const scope = Scope.reconstituteFromSnapshot(snapshot, []);

      expect(scope.ownerUserId.equals(ownerUserId)).toBe(true);
      expect(scope.scopeEpoch.value).toBe(2n);
      expect(scope.activeMembers).toHaveLength(2);
      expect(scope.version).toBe(5);
    });

    it('should apply tail events after snapshot', () => {
      const snapshot = {
        id: scopeId,
        ownerUserId,
        scopeEpoch: ScopeEpoch.from(1n),
        members: [
          {
            userId: ownerUserId,
            role: 'owner',
            addedAt: now,
            removedAt: null,
          },
        ],
        createdBy: ownerUserId,
        createdAt: now,
        version: 3,
      };

      const tailEvents = [
        new ScopeEpochRotated(
          {
            scopeId,
            oldEpoch: ScopeEpoch.from(1n),
            newEpoch: ScopeEpoch.from(2n),
            reason: 'tail event rotation',
            rotatedBy: ownerUserId,
            rotatedAt: now,
          },
          {
            aggregateId: scopeId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: ownerUserId,
          }
        ),
      ];

      const scope = Scope.reconstituteFromSnapshot(snapshot, tailEvents);

      expect(scope.scopeEpoch.value).toBe(2n);
      expect(scope.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('getters', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = Scope.create({
        id: scopeId,
        ownerUserId,
        createdBy: ownerUserId,
        createdAt: now,
      });
    });

    it('should return activeMembers excluding removed members', () => {
      scope.addMember({
        memberId: memberUserId,
        role: 'editor',
        addedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.activeMembers).toHaveLength(2);

      scope.removeMember({
        memberId: memberUserId,
        reason: 'test',
        removedAt: now,
        actorId: ownerUserId,
      });

      expect(scope.activeMembers).toHaveLength(1);
      expect(scope.members.size).toBe(2); // Both in members map
    });

    it('should return immutable members map', () => {
      const members = scope.members;

      // Should not be the same reference
      expect(members).not.toBe(scope.members);
    });
  });
});
