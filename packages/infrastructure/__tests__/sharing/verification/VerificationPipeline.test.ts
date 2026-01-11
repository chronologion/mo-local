import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VerificationPipeline,
  type VerifyDomainEventInput,
  type VerifyScopeStateInput,
} from '../../../src/sharing/verification/VerificationPipeline';
import { SignatureVerifier } from '../../../src/sharing/verification/SignatureVerifier';
import { DependencyValidator } from '../../../src/sharing/verification/DependencyValidator';
import { ScopeStateStore, type VerifiedScopeState } from '../../../src/sharing/stores/ScopeStateStore';

describe('VerificationPipeline', () => {
  let pipeline: VerificationPipeline;
  let signatureVerifier: SignatureVerifier;
  let dependencyValidator: DependencyValidator;
  let scopeStateStore: ScopeStateStore;

  beforeEach(() => {
    signatureVerifier = {
      verifyManifestSignature: vi.fn(),
    } as unknown as SignatureVerifier;

    dependencyValidator = {
      validateEventDependencies: vi.fn(),
      validateScopeStatePrevHash: vi.fn(),
    } as unknown as DependencyValidator;

    scopeStateStore = {
      loadByRef: vi.fn(),
      store: vi.fn(),
      parseMembers: vi.fn(),
      parseSigners: vi.fn(),
    } as unknown as ScopeStateStore;

    pipeline = new VerificationPipeline(signatureVerifier, dependencyValidator, scopeStateStore);
  });

  describe('verifyDomainEvent', () => {
    const baseInput: VerifyDomainEventInput = {
      eventId: 'event-123',
      aggregateType: 'Goal',
      aggregateId: 'goal-123',
      version: 1,
      scopeId: 'scope-123',
      resourceId: 'resource-123',
      resourceKeyId: 'key-123',
      grantId: 'grant-123',
      scopeStateRef: new Uint8Array(32).fill(1),
      authorDeviceId: 'device-123',
      payloadCiphertext: new Uint8Array([1, 2, 3, 4]),
      sigSuite: 'ecdsa-p256',
      signature: new Uint8Array(64).fill(2),
    };

    it('should verify event successfully when all checks pass', async () => {
      const scopeState: VerifiedScopeState = {
        scopeStateRef: baseInput.scopeStateRef,
        scopeId: baseInput.scopeId,
        scopeStateSeq: 5n,
        membersJson: JSON.stringify([{ userId: 'user-123', role: 'owner' }]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'user-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32).fill(3)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(scopeState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'user-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ]);
      vi.mocked(scopeStateStore.parseMembers).mockReturnValue([{ userId: 'user-123', role: 'owner' }]);
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(true);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(true);
    });

    it('should fail when dependency validation fails - scope_state_missing', async () => {
      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({
        ok: false,
        reason: 'scope_state_missing',
        details: 'ScopeState not found',
      });

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('dependency_missing');
        expect(result.details).toContain('ScopeState not found');
      }
    });

    it('should fail when dependency validation fails - grant_missing', async () => {
      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({
        ok: false,
        reason: 'grant_missing',
        details: 'Grant not found',
      });

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('dependency_missing');
      }
    });

    it('should fail when dependency validation fails - grant_revoked', async () => {
      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({
        ok: false,
        reason: 'grant_revoked',
        details: 'Grant is revoked',
      });

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('dependency_missing');
        expect(result.details).toContain('revoked');
      }
    });

    it('should fail when ScopeState not found after dependency validation', async () => {
      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(null);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain('ScopeState not found');
      }
    });

    it('should fail when signer device not found in ScopeState', async () => {
      const scopeState: VerifiedScopeState = {
        scopeStateRef: baseInput.scopeStateRef,
        scopeId: baseInput.scopeId,
        scopeStateSeq: 5n,
        membersJson: JSON.stringify([]),
        signersJson: JSON.stringify([
          {
            deviceId: 'other-device',
            userId: 'user-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(scopeState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'other-device',
          userId: 'user-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32) },
        },
      ]);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain('device-123');
      }
    });

    it('should fail when signer has no sig public key', async () => {
      const scopeState: VerifiedScopeState = {
        scopeStateRef: baseInput.scopeStateRef,
        scopeId: baseInput.scopeId,
        scopeStateSeq: 5n,
        membersJson: JSON.stringify([]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'user-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { enc: Buffer.from(new Uint8Array(32)).toString('base64') }, // Missing 'sig' key
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(scopeState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'user-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { enc: new Uint8Array(32) }, // Missing 'sig' key
        },
      ]);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain("no 'sig' public key");
      }
    });

    it('should fail when signature is invalid', async () => {
      const scopeState: VerifiedScopeState = {
        scopeStateRef: baseInput.scopeStateRef,
        scopeId: baseInput.scopeId,
        scopeStateSeq: 5n,
        membersJson: JSON.stringify([{ userId: 'user-123', role: 'owner' }]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'user-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32).fill(3)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(scopeState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'user-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ]);
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(false);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signature_invalid');
      }
    });

    it('should fail when signer user is not a member of the scope', async () => {
      const scopeState: VerifiedScopeState = {
        scopeStateRef: baseInput.scopeStateRef,
        scopeId: baseInput.scopeId,
        scopeStateSeq: 5n,
        membersJson: JSON.stringify([{ userId: 'other-user', role: 'owner' }]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'user-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32).fill(3)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      vi.mocked(dependencyValidator.validateEventDependencies).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(scopeState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'user-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ]);
      vi.mocked(scopeStateStore.parseMembers).mockReturnValue([{ userId: 'other-user', role: 'owner' }]);
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(true);

      const result = await pipeline.verifyDomainEvent(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_authorized');
        expect(result.details).toContain('not a member');
      }
    });
  });

  describe('verifyScopeState', () => {
    const baseInput: VerifyScopeStateInput = {
      scopeStateRef: new Uint8Array(32).fill(1),
      scopeId: 'scope-123',
      scopeStateSeq: 0n,
      prevHash: null,
      ownerUserId: 'owner-123',
      scopeEpoch: 1n,
      members: [{ userId: 'owner-123', role: 'owner' }],
      signers: [
        {
          deviceId: 'device-123',
          userId: 'owner-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ],
      sigSuite: 'ecdsa-p256',
      signature: new Uint8Array(64).fill(2),
    };

    it('should verify genesis ScopeState successfully', async () => {
      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(true);
      vi.mocked(scopeStateStore.store).mockResolvedValue(undefined);

      const result = await pipeline.verifyScopeState(baseInput);

      expect(result.ok).toBe(true);
      expect(scopeStateStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeStateRef: baseInput.scopeStateRef,
          scopeId: baseInput.scopeId,
          scopeStateSeq: 0n,
        })
      );
    });

    it('should verify non-genesis ScopeState successfully', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32).fill(5),
        scopeId: 'scope-123',
        scopeStateSeq: 4n,
        membersJson: JSON.stringify([{ userId: 'owner-123', role: 'owner' }]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'owner-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32).fill(3)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      const input: VerifyScopeStateInput = {
        ...baseInput,
        scopeStateSeq: 5n,
        prevHash: new Uint8Array(32).fill(5),
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'owner-123',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ]);
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(true);
      vi.mocked(scopeStateStore.store).mockResolvedValue(undefined);

      const result = await pipeline.verifyScopeState(input);

      expect(result.ok).toBe(true);
    });

    it('should fail when hash chain validation fails', async () => {
      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({
        ok: false,
        reason: 'scope_state_missing',
        details: 'Hash chain violation',
      });

      const result = await pipeline.verifyScopeState(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('dependency_missing');
        expect(result.details).toContain('Hash chain violation');
      }
    });

    it('should fail when genesis ScopeState owner is not in signers', async () => {
      const inputWithoutOwnerSigner: VerifyScopeStateInput = {
        ...baseInput,
        signers: [
          {
            deviceId: 'device-123',
            userId: 'other-user',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: new Uint8Array(32).fill(3) },
          },
        ],
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });

      const result = await pipeline.verifyScopeState(inputWithoutOwnerSigner);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain('Genesis ScopeState must include owner as signer');
      }
    });

    it('should fail when genesis owner signer has no sig public key', async () => {
      const inputWithoutSigKey: VerifyScopeStateInput = {
        ...baseInput,
        signers: [
          {
            deviceId: 'device-123',
            userId: 'owner-123',
            sigSuite: 'ecdsa-p256',
            pubKeys: { enc: new Uint8Array(32).fill(3) }, // Missing 'sig' key
          },
        ],
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });

      const result = await pipeline.verifyScopeState(inputWithoutSigKey);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain('no sig public key');
      }
    });

    it('should fail when non-genesis has null prevHash', async () => {
      const input: VerifyScopeStateInput = {
        ...baseInput,
        scopeStateSeq: 1n,
        prevHash: null,
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });

      const result = await pipeline.verifyScopeState(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('hash_chain_violation');
        expect(result.details).toContain('Non-genesis ScopeState must have prevHash');
      }
    });

    it('should fail when non-genesis prevState not found', async () => {
      const input: VerifyScopeStateInput = {
        ...baseInput,
        scopeStateSeq: 1n,
        prevHash: new Uint8Array(32).fill(5),
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(null);

      const result = await pipeline.verifyScopeState(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('dependency_missing');
        expect(result.details).toContain('Previous ScopeState not found');
      }
    });

    it('should fail when non-genesis owner not in prevState signers', async () => {
      const prevState: VerifiedScopeState = {
        scopeStateRef: new Uint8Array(32).fill(5),
        scopeId: 'scope-123',
        scopeStateSeq: 0n,
        membersJson: JSON.stringify([]),
        signersJson: JSON.stringify([
          {
            deviceId: 'device-123',
            userId: 'other-user',
            sigSuite: 'ecdsa-p256',
            pubKeys: { sig: Buffer.from(new Uint8Array(32).fill(3)).toString('base64') },
          },
        ]),
        signature: new Uint8Array(64),
        verifiedAt: Date.now(),
      };

      const input: VerifyScopeStateInput = {
        ...baseInput,
        scopeStateSeq: 1n,
        prevHash: new Uint8Array(32).fill(5),
      };

      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });
      vi.mocked(scopeStateStore.loadByRef).mockResolvedValue(prevState);
      vi.mocked(scopeStateStore.parseSigners).mockReturnValue([
        {
          deviceId: 'device-123',
          userId: 'other-user',
          sigSuite: 'ecdsa-p256',
          pubKeys: { sig: new Uint8Array(32).fill(3) },
        },
      ]);

      const result = await pipeline.verifyScopeState(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signer_not_found');
        expect(result.details).toContain('Owner not found in previous ScopeState signers');
      }
    });

    it('should fail when signature is invalid', async () => {
      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({ ok: true });
      vi.mocked(signatureVerifier.verifyManifestSignature).mockResolvedValue(false);

      const result = await pipeline.verifyScopeState(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('signature_invalid');
      }
    });

    it('should map scope_id_mismatch to hash_chain_violation', async () => {
      vi.mocked(dependencyValidator.validateScopeStatePrevHash).mockResolvedValue({
        ok: false,
        reason: 'scope_id_mismatch',
        details: 'Scope ID does not match',
      });

      const result = await pipeline.verifyScopeState(baseInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('hash_chain_violation');
        expect(result.details).toContain('Scope ID does not match');
      }
    });
  });
});
