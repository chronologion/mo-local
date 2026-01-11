import { ScopeId } from '../value-objects/ScopeId';
import { SequenceNumber } from '../value-objects/SequenceNumber';
import { UserId } from '../value-objects/UserId';

/**
 * ScopeState represents a signed membership/roles/epoch rotation record.
 * Forms a hash-chained append-only stream per scope.
 */
export type ScopeState = Readonly<{
  scopeId: ScopeId;
  scopeStateSeq: SequenceNumber;
  prevHash: Buffer | null; // NULL for genesis (seq=0)
  scopeStateRef: Buffer; // 32-byte hash of this record
  ownerUserId: UserId;
  scopeEpoch: bigint;
  signedRecordCbor: Buffer; // Full ScopeStateV1 CBOR
  members: Record<string, { role: string }>; // Derived from signedRecordCbor for queries
  signers: Record<string, { userId: string; sigSuite: string; pubKeys: unknown }>; // Derived
  sigSuite: string;
  signature: Buffer;
  createdAt: Date;
}>;
