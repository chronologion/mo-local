import { ManifestCodec, type DomainEventManifestV1 } from '../sync/ManifestCodec';
import { SignatureVerifier, type SignatureSuite, type VerificationResult } from './SignatureVerifier';
import { DependencyValidator } from './DependencyValidator';
import { ScopeStateStore } from '../stores/ScopeStateStore';

/**
 * Input for verifying a domain event.
 */
export type VerifyDomainEventInput = Readonly<{
  eventId: string;
  scopeId: string;
  resourceId: string;
  resourceKeyId: string;
  grantId: string;
  scopeStateRef: Uint8Array;
  authorDeviceId: string;
  payloadCiphertext: Uint8Array;
  sigSuite: SignatureSuite;
  signature: Uint8Array;
}>;

/**
 * Input for verifying a ScopeState record.
 */
export type VerifyScopeStateInput = Readonly<{
  scopeStateRef: Uint8Array;
  scopeId: string;
  scopeStateSeq: bigint;
  prevHash: Uint8Array | null;
  ownerUserId: string;
  scopeEpoch: bigint;
  members: ReadonlyArray<{ userId: string; role: string }>;
  signers: ReadonlyArray<{
    deviceId: string;
    userId: string;
    sigSuite: string;
    pubKeys: Readonly<Record<string, Uint8Array>>;
  }>;
  sigSuite: SignatureSuite;
  signature: Uint8Array;
}>;

/**
 * VerificationPipeline orchestrates the verification flow for signed artifacts.
 *
 * **Flow:** Validate dependencies → Resolve signer → Verify signature → Store verified artifact
 *
 * **Architecture:**
 * - Verification happens BEFORE decryption
 * - Signer public keys resolved from verified ScopeState (NOT from server)
 * - All artifacts stored in local cache after verification
 *
 * @see RFC-20260107-key-scopes-and-sharing.md
 */
export class VerificationPipeline {
  private readonly codec = new ManifestCodec();

  constructor(
    private readonly signatureVerifier: SignatureVerifier,
    private readonly dependencyValidator: DependencyValidator,
    private readonly scopeStateStore: ScopeStateStore
  ) {}

  /**
   * Verify a domain event before allowing decryption.
   *
   * Steps:
   * 1. Validate dependencies (scopeStateRef, grantId)
   * 2. Construct CBOR manifest
   * 3. Resolve signer public key from verified ScopeState
   * 4. Verify signature over manifest
   * 5. Validate author role/permission
   *
   * @param input - Event to verify
   * @returns Verification result
   */
  async verifyDomainEvent(input: VerifyDomainEventInput): Promise<VerificationResult> {
    // Step 1: Validate dependencies
    const depResult = await this.dependencyValidator.validateEventDependencies(input.scopeStateRef, input.grantId);
    if (!depResult.ok) {
      return {
        ok: false,
        reason: 'dependency_missing',
        details: depResult.details,
      };
    }

    // Step 2: Construct CBOR manifest
    const payloadCiphertextHash = await this.hashPayload(input.payloadCiphertext);
    const manifest: DomainEventManifestV1 = {
      version: 'mo-domain-event-manifest-v1',
      eventId: input.eventId,
      scopeId: input.scopeId,
      resourceId: input.resourceId,
      resourceKeyId: input.resourceKeyId,
      grantId: input.grantId,
      scopeStateRef: input.scopeStateRef,
      authorDeviceId: input.authorDeviceId,
      payloadAad: new Uint8Array(0), // TODO: Include AAD once encryption is updated
      payloadCiphertextHash,
    };

    const manifestBytes = this.codec.encodeDomainEventManifest(manifest);

    // Step 3: Resolve signer public key from verified ScopeState
    const scopeState = await this.scopeStateStore.loadByRef(input.scopeStateRef);
    if (!scopeState) {
      return {
        ok: false,
        reason: 'signer_not_found',
        details: `ScopeState not found for ref ${Buffer.from(input.scopeStateRef).toString('hex')}`,
      };
    }

    const signers = this.scopeStateStore.parseSigners(scopeState.signersJson);
    const signer = signers.find((s) => s.deviceId === input.authorDeviceId);
    if (!signer) {
      return {
        ok: false,
        reason: 'signer_not_found',
        details: `Signer device ${input.authorDeviceId} not found in ScopeState`,
      };
    }

    const publicKey = signer.pubKeys['sig']; // Convention: 'sig' key for signing
    if (!publicKey) {
      return {
        ok: false,
        reason: 'signer_not_found',
        details: `Signer device ${input.authorDeviceId} has no 'sig' public key`,
      };
    }

    // Step 4: Verify signature
    const signatureValid = await this.signatureVerifier.verifyManifestSignature(
      manifestBytes,
      input.signature,
      publicKey,
      input.sigSuite
    );

    if (!signatureValid) {
      return {
        ok: false,
        reason: 'signature_invalid',
        details: 'Signature verification failed',
      };
    }

    // Step 5: Validate author role/permission
    const members = this.scopeStateStore.parseMembers(scopeState.membersJson);
    const member = members.find((m) => m.userId === signer.userId);
    if (!member) {
      return {
        ok: false,
        reason: 'signer_not_authorized',
        details: `Signer user ${signer.userId} is not a member of the scope`,
      };
    }

    // TODO: Implement role-based permission checking
    // For now, all members can sign events

    return { ok: true };
  }

  /**
   * Verify a ScopeState record.
   *
   * Steps:
   * 1. Validate hash chain (prevHash exists)
   * 2. Construct CBOR manifest
   * 3. Resolve signer public key (bootstrap: owner's key or previous state)
   * 4. Verify signature
   * 5. Store verified ScopeState
   *
   * @param input - ScopeState to verify
   * @returns Verification result
   */
  async verifyScopeState(input: VerifyScopeStateInput): Promise<VerificationResult> {
    // Step 1: Validate hash chain
    const depResult = await this.dependencyValidator.validateScopeStatePrevHash(input.prevHash);
    if (!depResult.ok) {
      return {
        ok: false,
        reason: 'dependency_missing',
        details: depResult.details,
      };
    }

    // Step 2: Construct CBOR manifest
    const manifest = this.codec.encodeScopeStateManifest({
      version: 'mo-scope-state-manifest-v1',
      scopeId: input.scopeId,
      scopeStateSeq: input.scopeStateSeq,
      prevHash: input.prevHash,
      ownerUserId: input.ownerUserId,
      scopeEpoch: input.scopeEpoch,
      members: input.members,
      signers: input.signers,
    });

    // Step 3: Resolve signer public key
    // For genesis (seq=0), use owner's key from signers
    // For subsequent states, use previous state's signers
    let publicKey: Uint8Array;

    if (input.scopeStateSeq === 0n) {
      // Genesis: Owner must be first signer
      const ownerSigner = input.signers.find((s) => s.userId === input.ownerUserId);
      if (!ownerSigner) {
        return {
          ok: false,
          reason: 'signer_not_found',
          details: 'Genesis ScopeState must include owner as signer',
        };
      }
      publicKey = ownerSigner.pubKeys['sig'];
      if (!publicKey) {
        return {
          ok: false,
          reason: 'signer_not_found',
          details: 'Owner signer has no sig public key',
        };
      }
    } else {
      // Non-genesis: Resolve from previous state
      if (!input.prevHash) {
        return {
          ok: false,
          reason: 'hash_chain_violation',
          details: 'Non-genesis ScopeState must have prevHash',
        };
      }

      const prevState = await this.scopeStateStore.loadByRef(input.prevHash);
      if (!prevState) {
        return {
          ok: false,
          reason: 'dependency_missing',
          details: 'Previous ScopeState not found',
        };
      }

      // TODO: Implement proper signer resolution from prevState
      // For now, assume owner signs all updates
      const prevSigners = this.scopeStateStore.parseSigners(prevState.signersJson);
      const ownerSigner = prevSigners.find((s) => s.userId === input.ownerUserId);
      if (!ownerSigner) {
        return {
          ok: false,
          reason: 'signer_not_found',
          details: 'Owner not found in previous ScopeState signers',
        };
      }
      publicKey = ownerSigner.pubKeys['sig'];
      if (!publicKey) {
        return {
          ok: false,
          reason: 'signer_not_found',
          details: 'Owner signer has no sig public key',
        };
      }
    }

    // Step 4: Verify signature
    const signatureValid = await this.signatureVerifier.verifyManifestSignature(
      manifest,
      input.signature,
      publicKey,
      input.sigSuite
    );

    if (!signatureValid) {
      return {
        ok: false,
        reason: 'signature_invalid',
        details: 'Signature verification failed',
      };
    }

    // Step 5: Store verified ScopeState
    await this.scopeStateStore.store({
      scopeStateRef: input.scopeStateRef,
      scopeId: input.scopeId,
      scopeStateSeq: input.scopeStateSeq,
      membersJson: JSON.stringify(input.members),
      signersJson: JSON.stringify(
        input.signers.map((s) => ({
          ...s,
          pubKeys: Object.fromEntries(
            Object.entries(s.pubKeys).map(([k, v]) => [k, Buffer.from(v).toString('base64')])
          ),
        }))
      ),
      signature: input.signature,
      verifiedAt: Date.now(),
    });

    return { ok: true };
  }

  /**
   * Compute SHA-256 hash of payload ciphertext.
   */
  private async hashPayload(ciphertext: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', ciphertext);
    return new Uint8Array(hash);
  }
}
