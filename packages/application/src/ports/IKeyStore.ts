import { IdentityKeys, KeyBackup } from './types';

/**
 * Secure storage abstraction for identity and per-aggregate keys.
 */
export interface IKeyStore {
  // User identity keys
  saveIdentityKeys(userId: string, keys: IdentityKeys): Promise<void>;
  getIdentityKeys(userId: string): Promise<IdentityKeys | null>;

  // Aggregate keys (K_goal)
  saveAggregateKey(aggregateId: string, wrappedKey: Uint8Array): Promise<void>;
  getAggregateKey(aggregateId: string): Promise<Uint8Array | null>;

  // Backup/restore
  exportKeys(): Promise<KeyBackup>;
  importKeys(backup: KeyBackup): Promise<void>;
}
