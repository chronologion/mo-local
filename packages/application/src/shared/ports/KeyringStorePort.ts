import { KeyringState } from './types';

/**
 * Stores keyring state for aggregates to support key rotation and sharing.
 */
export interface KeyringStorePort {
  getKeyring(aggregateId: string): Promise<KeyringState | null>;
  saveKeyring(aggregateId: string, keyring: KeyringState): Promise<void>;
}
