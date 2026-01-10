import { GrantId } from '../../domain/value-objects/GrantId';
import { ScopeId } from '../../domain/value-objects/ScopeId';
import { ResourceId } from '../../domain/value-objects/ResourceId';
import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { ResourceGrant } from '../../domain/entities/ResourceGrant';

/**
 * Input for appending a new ResourceGrant record.
 */
export type ResourceGrantInput = Readonly<{
  grantId: GrantId;
  resourceId: ResourceId;
  prevHash: Buffer | null;
  grantHash: Buffer;
  scopeStateRef: Buffer;
  scopeEpoch: bigint;
  resourceKeyId: string;
  wrappedKey: Buffer;
  policy: unknown | null;
  status: 'active' | 'revoked';
  signedGrantCbor: Buffer;
  sigSuite: string;
  signature: Buffer;
}>;

/**
 * Repository port for ResourceGrant records.
 * Implementations must enforce monotonic append semantics and hash-chain validation.
 */
export abstract class ResourceGrantRepository {
  /**
   * Get the current head sequence number for a scope's grant stream.
   * Returns 0n if no grants exist yet (genesis).
   */
  abstract getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber>;

  /**
   * Append a new ResourceGrant record with optimistic concurrency control.
   *
   * Throws ResourceGrantHeadMismatchError if expectedHead doesn't match current head.
   * Throws Error if prevHash doesn't match current head hash (hash-chain violation).
   */
  abstract appendGrant(params: {
    scopeId: ScopeId;
    expectedHead: SequenceNumber;
    grant: ResourceGrantInput;
  }): Promise<{ seq: SequenceNumber; hash: Buffer }>;

  /**
   * Load ResourceGrant records for a scope since a given sequence number (delta stream).
   *
   * @param since - Start from records with seq > since
   * @param limit - Maximum number of records to return
   * @returns Records ordered by grant_seq ascending
   */
  abstract loadSince(scopeId: ScopeId, since: SequenceNumber, limit: number): Promise<ResourceGrant[]>;

  /**
   * Get the current active grant for a (scopeId, resourceId) pair.
   * Returns null if no grant exists.
   */
  abstract getActiveGrant(scopeId: ScopeId, resourceId: ResourceId): Promise<ResourceGrant | null>;

  /**
   * Load a single ResourceGrant record by its grant_id.
   * Returns null if not found.
   */
  abstract loadByGrantId(grantId: GrantId): Promise<ResourceGrant | null>;
}

/**
 * Error thrown when optimistic concurrency check fails during appendGrant.
 */
export class ResourceGrantHeadMismatchError extends Error {
  constructor(
    public readonly currentHead: SequenceNumber,
    public readonly expectedHead: SequenceNumber
  ) {
    super(`ResourceGrant head mismatch: expected ${expectedHead.toString()}, got ${currentHead.toString()}`);
    this.name = 'ResourceGrantHeadMismatchError';
  }
}
