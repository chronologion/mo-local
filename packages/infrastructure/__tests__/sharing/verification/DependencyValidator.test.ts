import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyValidator } from '../../../src/sharing/verification/DependencyValidator';
import { ScopeStateStore, type VerifiedScopeState } from '../../../src/sharing/stores/ScopeStateStore';
import { ResourceGrantStore } from '../../../src/sharing/stores/ResourceGrantStore';

describe('DependencyValidator', () => {
  let validator: DependencyValidator;
  let scopeStateStore: ScopeStateStore;
  let grantStore: ResourceGrantStore;

  beforeEach(() => {
    scopeStateStore = {
      exists: vi.fn(),
      loadByRef: vi.fn(),
      getHead: vi.fn(),
      loadByScopeId: vi.fn(),
    } as unknown as ScopeStateStore;

    grantStore = {
      exists: vi.fn(),
      isActive: vi.fn(),
    } as unknown as ResourceGrantStore;

    validator = new DependencyValidator(scopeStateStore, grantStore);
  });

  describe('validateEventDependencies', () => {
    it('should pass when both scopeStateRef and grantId exist and grant is active', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(true);
      vi.mocked(grantStore.exists).mockResolvedValue(true);
      vi.mocked(grantStore.isActive).mockResolvedValue(true);

      const result = await validator.validateEventDependencies(new Uint8Array(32), 'grant-123');

      expect(result.ok).toBe(true);
    });

    it('should fail when scopeStateRef does not exist', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(false);

      const scopeStateRef = new Uint8Array(32);
      const result = await validator.validateEventDependencies(scopeStateRef, 'grant-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('not found in verified cache');
      }
    });

    it('should fail when grantId does not exist', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(true);
      vi.mocked(grantStore.exists).mockResolvedValue(false);

      const result = await validator.validateEventDependencies(new Uint8Array(32), 'grant-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('grant_missing');
        expect(result.details).toContain('grant-123');
      }
    });

    it('should fail when grant is revoked', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(true);
      vi.mocked(grantStore.exists).mockResolvedValue(true);
      vi.mocked(grantStore.isActive).mockResolvedValue(false);

      const result = await validator.validateEventDependencies(new Uint8Array(32), 'grant-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('grant_revoked');
        expect(result.details).toContain('revoked');
      }
    });
  });

  describe('validateScopeStatePrevHash - Genesis validation', () => {
    it('should pass for genesis (seq=0, prevHash=null)', async () => {
      const result = await validator.validateScopeStatePrevHash({
        prevHash: null,
        scopeStateSeq: 0n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(true);
    });

    it('should fail when genesis has non-zero sequence', async () => {
      const result = await validator.validateScopeStatePrevHash({
        prevHash: null,
        scopeStateSeq: 1n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('Genesis ScopeState must have seq=0');
      }
    });

    it('should fail when non-genesis has seq=0', async () => {
      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 0n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('Non-genesis ScopeState cannot have seq=0');
      }
    });
  });

  describe('validateScopeStatePrevHash - Sequence number validation', () => {
    it('should pass when sequence is exactly prevSeq + 1', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32),
        scopeId: 'scope-123',
        scopeStateSeq: 5n,
        membersJson: '[]',
        signersJson: '[]',
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);
      vi.mocked(scopeStateStore.getHead).mockResolvedValue(prevState);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 6n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(true);
    });

    it('should fail when sequence is not exactly prevSeq + 1', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32),
        scopeId: 'scope-123',
        scopeStateSeq: 5n,
        membersJson: '[]',
        signersJson: '[]',
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 10n, // Gap!
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('Sequence number must be 6');
        expect(result.details).toContain('got 10');
      }
    });

    it('should fail when prevHash does not exist', async () => {
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(null);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 1n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('hash chain violation');
      }
    });
  });

  describe('validateScopeStatePrevHash - Scope ID validation', () => {
    it('should fail when prevState belongs to different scope', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32),
        scopeId: 'scope-999', // Different scope!
        scopeStateSeq: 5n,
        membersJson: '[]',
        signersJson: '[]',
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 6n,
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_id_mismatch');
        expect(result.details).toContain('different scope');
        expect(result.details).toContain('scope-999');
      }
    });
  });

  describe('validateScopeStatePrevHash - Fork detection', () => {
    it('should fail when new seq does not extend current head', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32),
        scopeId: 'scope-123',
        scopeStateSeq: 5n,
        membersJson: '[]',
        signersJson: '[]',
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      const headState: VerifiedScopeState = {
        ...prevState,
        scopeStateSeq: 10n, // Head is at seq 10
      };

      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);
      vi.mocked(scopeStateStore.getHead).mockResolvedValue(headState);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 6n, // Trying to add seq 6, but head is at 10 = fork!
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
        expect(result.details).toContain('Fork detected');
        expect(result.details).toContain('new seq 6');
        expect(result.details).toContain('head seq 10');
      }
    });

    it('should pass when new seq extends current head', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32),
        scopeId: 'scope-123',
        scopeStateSeq: 9n,
        membersJson: '[]',
        signersJson: '[]',
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      const headState: VerifiedScopeState = {
        ...prevState,
        scopeStateSeq: 9n, // Head is at seq 9
      };

      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);
      vi.mocked(scopeStateStore.getHead).mockResolvedValue(headState);

      const result = await validator.validateScopeStatePrevHash({
        prevHash: new Uint8Array(32),
        scopeStateSeq: 10n, // Extending head from 9 to 10 = OK
        scopeId: 'scope-123',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('validateGrantDependency', () => {
    it('should pass when scopeStateRef exists', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(true);

      const result = await validator.validateGrantDependency(new Uint8Array(32));

      expect(result.ok).toBe(true);
    });

    it('should fail when scopeStateRef does not exist', async () => {
      vi.mocked(scopeStateStore.exists).mockResolvedValue(false);

      const result = await validator.validateGrantDependency(new Uint8Array(32));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('scope_state_missing');
      }
    });
  });
});
