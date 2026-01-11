import { EnvelopeId } from '../../domain/value-objects/EnvelopeId';
import { ScopeId } from '../../domain/value-objects/ScopeId';
import { UserId } from '../../domain/value-objects/UserId';
import { KeyEnvelope } from '../../domain/entities/KeyEnvelope';

/**
 * Input for creating a new KeyEnvelope record.
 */
export type KeyEnvelopeInput = Readonly<{
  envelopeId: EnvelopeId;
  scopeId: ScopeId;
  recipientUserId: UserId;
  scopeEpoch: bigint;
  recipientUkPubFingerprint: Buffer;
  ciphersuite: string;
  ciphertext: Buffer;
  metadata: unknown | null;
}>;

/**
 * Repository port for KeyEnvelope records.
 */
export abstract class KeyEnvelopeRepository {
  /**
   * Create a new KeyEnvelope record.
   *
   * Throws if a record with the same (scopeId, recipientUserId, scopeEpoch) already exists.
   */
  abstract createEnvelope(envelope: KeyEnvelopeInput): Promise<void>;

  /**
   * Get all envelopes for a specific recipient in a scope.
   *
   * @param scopeEpoch - Optional filter for specific epoch
   * @returns Envelopes ordered by scope_epoch ascending
   */
  abstract getEnvelopes(scopeId: ScopeId, recipientUserId: UserId, scopeEpoch?: bigint): Promise<KeyEnvelope[]>;
}
