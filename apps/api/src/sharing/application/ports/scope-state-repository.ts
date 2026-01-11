import { ScopeId } from '../../domain/value-objects/ScopeId';
import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { UserId } from '../../domain/value-objects/UserId';
import { ScopeState } from '../../domain/entities/ScopeState';

/**
 * Input for appending a new ScopeState record.
 */
export type ScopeStateInput = Readonly<{
  prevHash: Buffer | null;
  scopeStateRef: Buffer;
  ownerUserId: UserId;
  scopeEpoch: bigint;
  signedRecordCbor: Buffer;
  members: Record<string, { role: string }>;
  signers: Record<string, { userId: string; sigSuite: string; pubKeys: unknown }>;
  sigSuite: string;
  signature: Buffer;
}>;

/**
 * Repository port for ScopeState records.
 * Implementations must enforce monotonic append semantics and hash-chain validation.
 */
export abstract class ScopeStateRepository {
  /**
   * Get the current head sequence number for a scope.
   * Returns 0n if the scope doesn't exist yet (genesis).
   */
  abstract getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber>;

  /**
   * Get the current head hash (scopeStateRef) for a scope.
   * Returns null if the scope doesn't exist yet (genesis).
   */
  abstract getHeadRef(scopeId: ScopeId): Promise<Buffer | null>;

  /**
   * Append a new ScopeState record with optimistic concurrency control.
   *
   * Throws ScopeStateHeadMismatchError if expectedHead doesn't match current head.
   * Throws Error if prevHash doesn't match current head_ref (hash-chain violation).
   */
  abstract appendState(params: {
    scopeId: ScopeId;
    expectedHead: SequenceNumber;
    state: ScopeStateInput;
  }): Promise<{ seq: SequenceNumber; ref: Buffer }>;

  /**
   * Load ScopeState records since a given sequence number (delta stream).
   *
   * @param since - Start from records with seq > since
   * @param limit - Maximum number of records to return
   * @returns Records ordered by scope_state_seq ascending
   */
  abstract loadSince(scopeId: ScopeId, since: SequenceNumber, limit: number): Promise<ScopeState[]>;

  /**
   * Load a single ScopeState record by its scope_state_ref hash.
   * Returns null if not found.
   */
  abstract loadByRef(scopeStateRef: Buffer): Promise<ScopeState | null>;
}

/**
 * Error thrown when optimistic concurrency check fails during appendState.
 */
export class ScopeStateHeadMismatchError extends Error {
  constructor(
    public readonly currentHead: SequenceNumber,
    public readonly expectedHead: SequenceNumber
  ) {
    super(`ScopeState head mismatch: expected ${expectedHead.toString()}, got ${currentHead.toString()}`);
    this.name = 'ScopeStateHeadMismatchError';
  }
}
