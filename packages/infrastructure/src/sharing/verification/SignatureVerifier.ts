import { CryptoServicePort } from '@mo/application';

/**
 * Signature suite identifier for hybrid signatures.
 *
 * TODO: Implement full hybrid-sig-1 support (Ed25519 + ML-DSA).
 * Currently only ECDSA P-256 is supported.
 */
export type SignatureSuite = 'ecdsa-p256' | 'hybrid-sig-1';

/**
 * SignatureVerifier verifies cryptographic signatures over CBOR manifests.
 *
 * **Current Implementation:** ECDSA P-256 only
 * **Planned:** Hybrid signatures (Ed25519 + ML-DSA, both must validate)
 *
 * @see RFC-20260107-key-scopes-and-sharing.md
 */
export class SignatureVerifier {
  constructor(private readonly cryptoService: CryptoServicePort) {}

  /**
   * Verify a signature over a CBOR-encoded manifest.
   *
   * @param manifest - CBOR-encoded manifest bytes
   * @param signature - Signature bytes
   * @param publicKey - Public key bytes (format depends on sigSuite)
   * @param sigSuite - Signature suite identifier
   * @returns true if signature is valid, false otherwise
   *
   * @throws {Error} if sigSuite is not supported
   */
  async verifyManifestSignature(
    manifest: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    sigSuite: SignatureSuite
  ): Promise<boolean> {
    switch (sigSuite) {
      case 'ecdsa-p256':
        return this.verifyEcdsaP256(manifest, signature, publicKey);

      case 'hybrid-sig-1':
        throw new Error(
          'Hybrid signature verification (Ed25519 + ML-DSA) not yet implemented. ' +
            'Cannot verify hybrid-sig-1 signatures until full implementation is complete.'
        );

      default:
        throw new Error(`Unsupported signature suite: ${sigSuite}`);
    }
  }

  /**
   * Verify an ECDSA P-256 signature.
   *
   * @param data - Data that was signed
   * @param signature - ECDSA signature bytes
   * @param publicKey - ECDSA public key (SPKI format)
   * @returns true if signature is valid, false otherwise
   */
  private async verifyEcdsaP256(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    try {
      return await this.cryptoService.verify(data, signature, publicKey);
    } catch {
      // Signature verification errors (invalid format, etc.) should return false
      // rather than throwing, to allow graceful handling of invalid signatures
      return false;
    }
  }

  /**
   * Verify a hybrid signature (Ed25519 + ML-DSA).
   *
   * TODO: Implement this method with:
   * 1. Parse combined signature (Ed25519 || ML-DSA)
   * 2. Verify Ed25519 signature
   * 3. Verify ML-DSA signature
   * 4. Return true only if BOTH are valid (hybrid-AND)
   *
   * @param data - Data that was signed
   * @param signature - Combined signature bytes
   * @param publicKey - Combined public key bytes
   * @returns true if both signatures are valid
   */
  private async verifyHybridSignature(
    _data: Uint8Array,
    _signature: Uint8Array,
    _publicKey: Uint8Array
  ): Promise<boolean> {
    // Placeholder for future implementation
    throw new Error('Hybrid signature verification not yet implemented');
  }
}

/**
 * Verification result for a signed artifact.
 */
export type VerificationFailureReason =
  | 'signature_invalid'
  | 'dependency_missing'
  | 'signer_not_found'
  | 'signer_not_authorized'
  | 'hash_chain_violation';

export type VerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason: VerificationFailureReason;
      details?: string;
    };

/**
 * Error thrown when signature verification fails.
 */
export class SignatureVerificationError extends Error {
  constructor(
    message: string,
    public readonly reason: VerificationFailureReason
  ) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}
