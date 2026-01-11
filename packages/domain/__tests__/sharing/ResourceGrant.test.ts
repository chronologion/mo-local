import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceGrant } from '../../src/sharing/ResourceGrant';
import { GrantId } from '../../src/sharing/vos/GrantId';
import { ScopeId } from '../../src/sharing/vos/ScopeId';
import { ResourceId } from '../../src/sharing/vos/ResourceId';
import { ScopeEpoch } from '../../src/sharing/vos/ScopeEpoch';
import { UserId } from '../../src/identity/UserId';
import { Timestamp } from '../../src/shared/vos/Timestamp';
import { ResourceGranted } from '../../src/sharing/events/ResourceGranted';
import { ResourceRevoked } from '../../src/sharing/events/ResourceRevoked';
import { EventId } from '../../src/shared/vos/EventId';

describe('ResourceGrant', () => {
  const grantId = GrantId.create();
  const scopeId = ScopeId.create();
  const resourceId = ResourceId.create();
  const userId = UserId.from('user-789');
  const now = Timestamp.fromMillis(1_700_000_000_000);
  const wrappedKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const resourceKeyId = 'key-123';

  describe('create', () => {
    it('should create new grant with active status', () => {
      const grant = ResourceGrant.create({
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      expect(grant.id.equals(grantId)).toBe(true);
      expect(grant.scopeId.equals(scopeId)).toBe(true);
      expect(grant.resourceId.equals(resourceId)).toBe(true);
      expect(grant.scopeEpoch.value).toBe(1n);
      expect(grant.resourceKeyId).toBe(resourceKeyId);
      expect(grant.wrappedKey).toEqual(wrappedKey);
      expect(grant.status).toBe('active');
      expect(grant.isActive).toBe(true);
      expect(grant.isRevoked).toBe(false);
      expect(grant.grantedBy.equals(userId)).toBe(true);
      expect(grant.grantedAt.equals(now)).toBe(true);
      expect(grant.revokedBy).toBeNull();
      expect(grant.revokedAt).toBeNull();
    });

    it('should emit ResourceGranted event', () => {
      const grant = ResourceGrant.create({
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      const events = grant.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ResourceGranted);

      const event = events[0] as ResourceGranted;
      expect(event.grantId.equals(grantId)).toBe(true);
      expect(event.scopeId.equals(scopeId)).toBe(true);
      expect(event.resourceId.equals(resourceId)).toBe(true);
      expect(event.scopeEpoch.value).toBe(1n);
      expect(event.resourceKeyId).toBe(resourceKeyId);
      expect(event.wrappedKey).toEqual(wrappedKey);
      expect(event.grantedBy.equals(userId)).toBe(true);
    });

    it('should throw error when wrappedKey is empty', () => {
      expect(() => {
        ResourceGrant.create({
          id: grantId,
          scopeId,
          resourceId,
          scopeEpoch: ScopeEpoch.from(1n),
          resourceKeyId,
          wrappedKey: new Uint8Array([]), // Empty!
          grantedBy: userId,
          grantedAt: now,
        });
      }).toThrow('WrappedKey cannot be empty');
    });

    it('should throw error when resourceKeyId is empty', () => {
      expect(() => {
        ResourceGrant.create({
          id: grantId,
          scopeId,
          resourceId,
          scopeEpoch: ScopeEpoch.from(1n),
          resourceKeyId: '', // Empty!
          wrappedKey,
          grantedBy: userId,
          grantedAt: now,
        });
      }).toThrow('ResourceKeyId');
    });

    it('should create grant with different scope epochs', () => {
      const grant0 = ResourceGrant.create({
        id: GrantId.create(),
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.zero(),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      const grant5 = ResourceGrant.create({
        id: GrantId.create(),
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(5n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      expect(grant0.scopeEpoch.value).toBe(0n);
      expect(grant5.scopeEpoch.value).toBe(5n);
    });
  });

  describe('revoke', () => {
    let grant: ResourceGrant;

    beforeEach(() => {
      grant = ResourceGrant.create({
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });
      grant.markEventsAsCommitted();
    });

    it('should revoke active grant successfully', () => {
      const revokedAt = Timestamp.fromMillis(1_700_000_001_000);

      grant.revoke({
        reason: 'resource archived',
        revokedAt,
        actorId: userId,
      });

      expect(grant.status).toBe('revoked');
      expect(grant.isActive).toBe(false);
      expect(grant.isRevoked).toBe(true);
      expect(grant.revokedBy!.equals(userId)).toBe(true);
      expect(grant.revokedAt!.equals(revokedAt)).toBe(true);
    });

    it('should emit ResourceRevoked event', () => {
      const revokedAt = Timestamp.fromMillis(1_700_000_001_000);

      grant.revoke({
        reason: 'resource archived',
        revokedAt,
        actorId: userId,
      });

      const events = grant.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ResourceRevoked);

      const event = events[0] as ResourceRevoked;
      expect(event.grantId.equals(grantId)).toBe(true);
      expect(event.scopeId.equals(scopeId)).toBe(true);
      expect(event.resourceId.equals(resourceId)).toBe(true);
      expect(event.reason).toBe('resource archived');
      expect(event.revokedBy.equals(userId)).toBe(true);
      expect(event.revokedAt.equals(revokedAt)).toBe(true);
    });

    it('should throw error when revoking already revoked grant', () => {
      grant.revoke({
        reason: 'first revoke',
        revokedAt: now,
        actorId: userId,
      });

      expect(() => {
        grant.revoke({
          reason: 'second revoke',
          revokedAt: now,
          actorId: userId,
        });
      }).toThrow('Cannot revoke: grant is already revoked');
    });

    it('should support various revocation reasons', () => {
      const reasons = ['resource deleted', 'scope expired', 'user removed', 'security breach'];

      reasons.forEach((reason) => {
        const testGrant = ResourceGrant.create({
          id: GrantId.create(),
          scopeId,
          resourceId,
          scopeEpoch: ScopeEpoch.from(1n),
          resourceKeyId,
          wrappedKey,
          grantedBy: userId,
          grantedAt: now,
        });

        testGrant.revoke({
          reason,
          revokedAt: now,
          actorId: userId,
        });

        expect(testGrant.isRevoked).toBe(true);
      });
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute active grant from events', () => {
      const events = [
        new ResourceGranted(
          {
            grantId,
            scopeId,
            resourceId,
            scopeEpoch: ScopeEpoch.from(2n),
            resourceKeyId,
            wrappedKey,
            grantedBy: userId,
            grantedAt: now,
          },
          {
            aggregateId: grantId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: userId,
          }
        ),
      ];

      const grant = ResourceGrant.reconstitute(grantId, events);

      expect(grant.id.equals(grantId)).toBe(true);
      expect(grant.scopeId.equals(scopeId)).toBe(true);
      expect(grant.resourceId.equals(resourceId)).toBe(true);
      expect(grant.scopeEpoch.value).toBe(2n);
      expect(grant.isActive).toBe(true);
      expect(grant.isRevoked).toBe(false);
      expect(grant.getUncommittedEvents()).toHaveLength(0); // Events committed
    });

    it('should reconstitute revoked grant from events', () => {
      const revokedAt = Timestamp.fromMillis(1_700_000_001_000);

      const events = [
        new ResourceGranted(
          {
            grantId,
            scopeId,
            resourceId,
            scopeEpoch: ScopeEpoch.from(1n),
            resourceKeyId,
            wrappedKey,
            grantedBy: userId,
            grantedAt: now,
          },
          {
            aggregateId: grantId,
            occurredAt: now,
            eventId: EventId.create(),
            actorId: userId,
          }
        ),
        new ResourceRevoked(
          {
            grantId,
            scopeId,
            resourceId,
            reason: 'test revocation',
            revokedBy: userId,
            revokedAt,
          },
          {
            aggregateId: grantId,
            occurredAt: revokedAt,
            eventId: EventId.create(),
            actorId: userId,
          }
        ),
      ];

      const grant = ResourceGrant.reconstitute(grantId, events);

      expect(grant.isRevoked).toBe(true);
      expect(grant.revokedBy!.equals(userId)).toBe(true);
      expect(grant.revokedAt!.equals(revokedAt)).toBe(true);
    });
  });

  describe('reconstituteFromSnapshot', () => {
    it('should reconstitute from snapshot with no tail events', () => {
      const snapshot = {
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(3n),
        resourceKeyId,
        wrappedKey,
        status: 'active' as const,
        grantedBy: userId,
        grantedAt: now,
        revokedBy: null,
        revokedAt: null,
        version: 5,
      };

      const grant = ResourceGrant.reconstituteFromSnapshot(snapshot, []);

      expect(grant.id.equals(grantId)).toBe(true);
      expect(grant.scopeEpoch.value).toBe(3n);
      expect(grant.isActive).toBe(true);
      expect(grant.version).toBe(5);
    });

    it('should apply tail events after snapshot', () => {
      const revokedAt = Timestamp.fromMillis(1_700_000_001_000);

      const snapshot = {
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        status: 'active' as const,
        grantedBy: userId,
        grantedAt: now,
        revokedBy: null,
        revokedAt: null,
        version: 2,
      };

      const tailEvents = [
        new ResourceRevoked(
          {
            grantId,
            scopeId,
            resourceId,
            reason: 'tail event revocation',
            revokedBy: userId,
            revokedAt,
          },
          {
            aggregateId: grantId,
            occurredAt: revokedAt,
            eventId: EventId.create(),
            actorId: userId,
          }
        ),
      ];

      const grant = ResourceGrant.reconstituteFromSnapshot(snapshot, tailEvents);

      expect(grant.isRevoked).toBe(true);
      expect(grant.revokedAt!.equals(revokedAt)).toBe(true);
      expect(grant.getUncommittedEvents()).toHaveLength(0);
    });

    it('should reconstitute revoked grant from snapshot', () => {
      const revokedAt = Timestamp.fromMillis(1_700_000_001_000);

      const snapshot = {
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        status: 'revoked' as const,
        grantedBy: userId,
        grantedAt: now,
        revokedBy: userId,
        revokedAt,
        version: 3,
      };

      const grant = ResourceGrant.reconstituteFromSnapshot(snapshot, []);

      expect(grant.isRevoked).toBe(true);
      expect(grant.revokedBy!.equals(userId)).toBe(true);
      expect(grant.revokedAt!.equals(revokedAt)).toBe(true);
    });
  });

  describe('getters', () => {
    it('should return all grant properties', () => {
      const grant = ResourceGrant.create({
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      // Verify all getters work
      expect(grant.id.equals(grantId)).toBe(true);
      expect(grant.scopeId.equals(scopeId)).toBe(true);
      expect(grant.resourceId.equals(resourceId)).toBe(true);
      expect(grant.scopeEpoch.value).toBe(1n);
      expect(grant.resourceKeyId).toBe(resourceKeyId);
      expect(grant.wrappedKey).toEqual(wrappedKey);
      expect(grant.status).toBe('active');
      expect(grant.isActive).toBe(true);
      expect(grant.isRevoked).toBe(false);
      expect(grant.grantedBy.equals(userId)).toBe(true);
      expect(grant.grantedAt.equals(now)).toBe(true);
      expect(grant.revokedBy).toBeNull();
      expect(grant.revokedAt).toBeNull();
    });

    it('should return correct status for revoked grant', () => {
      const grant = ResourceGrant.create({
        id: grantId,
        scopeId,
        resourceId,
        scopeEpoch: ScopeEpoch.from(1n),
        resourceKeyId,
        wrappedKey,
        grantedBy: userId,
        grantedAt: now,
      });

      grant.revoke({
        reason: 'test',
        revokedAt: now,
        actorId: userId,
      });

      expect(grant.status).toBe('revoked');
      expect(grant.isActive).toBe(false);
      expect(grant.isRevoked).toBe(true);
    });
  });
});
