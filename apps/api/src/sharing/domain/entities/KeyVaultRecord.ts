import { SequenceNumber } from '../value-objects/SequenceNumber';

/**
 * KeyVaultRecord represents a record in the append-only encrypted key log.
 * Forms a hash-chained stream per user for recovery and multi-device sync.
 */
export type KeyVaultRecord = Readonly<{
  userId: string; // UUID
  recordSeq: SequenceNumber;
  prevHash: Buffer | null; // NULL for genesis
  recordHash: Buffer; // 32-byte hash of this record
  ciphertext: Buffer; // Encrypted record container
  metadata: unknown | null; // Optional metadata (JSONB)
  createdAt: Date;
}>;
