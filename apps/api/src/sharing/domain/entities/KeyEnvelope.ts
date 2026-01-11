import { EnvelopeId } from '../value-objects/EnvelopeId';
import { ScopeId } from '../value-objects/ScopeId';
import { UserId } from '../value-objects/UserId';

/**
 * KeyEnvelope represents a per-user scope key distribution artifact.
 * Contains the ciphertext of K_scope^epoch wrapped to a specific recipient's UK public key.
 */
export type KeyEnvelope = Readonly<{
  envelopeId: EnvelopeId;
  scopeId: ScopeId;
  recipientUserId: UserId;
  scopeEpoch: bigint;
  recipientUkPubFingerprint: Buffer; // AAD binding for verification
  ciphersuite: string; // e.g., "hybrid-kem-1"
  ciphertext: Buffer;
  metadata: unknown | null; // Optional metadata (JSONB)
  createdAt: Date;
}>;
