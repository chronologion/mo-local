import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { KeyVaultRecord } from '../../domain/entities/KeyVaultRecord';

/**
 * Input for appending a new KeyVault record.
 */
export type KeyVaultRecordInput = Readonly<{
  prevHash: Buffer | null;
  recordHash: Buffer;
  ciphertext: Buffer;
  metadata: unknown | null;
}>;

/**
 * Repository port for KeyVault records.
 * Implementations must enforce monotonic append semantics and hash-chain validation.
 */
export abstract class KeyVaultRepository {
  /**
   * Get the current head sequence number for a user's KeyVault.
   * Returns 0n if no records exist yet (genesis).
   */
  abstract getHeadSeq(userId: string): Promise<SequenceNumber>;

  /**
   * Get the current head hash for a user's KeyVault.
   * Returns null if no records exist yet (genesis).
   */
  abstract getHeadHash(userId: string): Promise<Buffer | null>;

  /**
   * Append a new KeyVault record with optimistic concurrency control.
   *
   * Throws KeyVaultHeadMismatchError if expectedHead doesn't match current head.
   * Throws Error if prevHash doesn't match current head hash (hash-chain violation).
   */
  abstract appendRecord(params: {
    userId: string;
    expectedHead: SequenceNumber;
    record: KeyVaultRecordInput;
  }): Promise<{ seq: SequenceNumber; hash: Buffer }>;

  /**
   * Load KeyVault records for a user since a given sequence number (delta stream).
   *
   * @param since - Start from records with seq > since
   * @param limit - Maximum number of records to return
   * @returns Records ordered by record_seq ascending
   */
  abstract loadSince(userId: string, since: SequenceNumber, limit: number): Promise<KeyVaultRecord[]>;
}

/**
 * Error thrown when optimistic concurrency check fails during appendRecord.
 */
export class KeyVaultHeadMismatchError extends Error {
  constructor(
    public readonly currentHead: SequenceNumber,
    public readonly expectedHead: SequenceNumber
  ) {
    super(`KeyVault head mismatch: expected ${expectedHead.toString()}, got ${currentHead.toString()}`);
    this.name = 'KeyVaultHeadMismatchError';
  }
}
