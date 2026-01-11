import { GrantId } from '../value-objects/GrantId';
import { ScopeId } from '../value-objects/ScopeId';
import { ResourceId } from '../value-objects/ResourceId';
import { SequenceNumber } from '../value-objects/SequenceNumber';

/**
 * ResourceGrant represents a signed catalog/policy record that grants a scope access
 * to a specific resource key version and carries the wrapped key bytes.
 * Forms a hash-chained append-only stream per scope.
 */
export type ResourceGrant = Readonly<{
  grantId: GrantId;
  scopeId: ScopeId;
  resourceId: ResourceId;
  grantSeq: SequenceNumber;
  prevHash: Buffer | null; // NULL for genesis
  grantHash: Buffer; // 32-byte hash of this record
  scopeStateRef: Buffer; // Dependency ref to ScopeState
  scopeEpoch: bigint;
  resourceKeyId: string;
  wrappedKey: Buffer; // K_resource wrapped under K_scope^epoch
  policy: unknown | null; // Optional policy (JSONB)
  status: 'active' | 'revoked';
  signedGrantCbor: Buffer; // Full ResourceGrantV1 CBOR
  sigSuite: string;
  signature: Buffer;
  createdAt: Date;
}>;
