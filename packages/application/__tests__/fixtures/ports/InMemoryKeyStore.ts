import { KeyStorePort } from '../../../src/shared/ports/KeyStorePort';
import { IdentityKeys, KeyBackup } from '../../../src/shared/ports/types';

export class InMemoryKeyStore implements KeyStorePort {
  private identityKeys = new Map<string, IdentityKeys>();
  private aggregateKeys = new Map<string, Uint8Array>();
  private masterKey: Uint8Array | null = null;
  setMasterKey(key: Uint8Array): void {
    this.masterKey = new Uint8Array(key);
  }

  getMasterKey(): Uint8Array | null {
    return this.masterKey ? new Uint8Array(this.masterKey) : null;
  }

  async saveIdentityKeys(userId: string, keys: IdentityKeys): Promise<void> {
    this.identityKeys.set(userId, keys);
  }

  async getIdentityKeys(userId: string): Promise<IdentityKeys | null> {
    return this.identityKeys.get(userId) ?? null;
  }

  async saveAggregateKey(aggregateId: string, wrappedKey: Uint8Array): Promise<void> {
    this.aggregateKeys.set(aggregateId, wrappedKey);
  }

  async getAggregateKey(aggregateId: string): Promise<Uint8Array | null> {
    return this.aggregateKeys.get(aggregateId) ?? null;
  }

  removeAggregateKey(aggregateId: string): void {
    this.aggregateKeys.delete(aggregateId);
  }

  async exportKeys(): Promise<KeyBackup> {
    const aggregateKeys: Record<string, Uint8Array> = {};
    this.aggregateKeys.forEach((value, key) => {
      aggregateKeys[key] = value;
    });

    const identityEntry = this.identityKeys.entries().next();
    const identityKeys = identityEntry.done ? null : identityEntry.value[1];
    const userId = identityEntry.done ? undefined : identityEntry.value[0];

    return { identityKeys, aggregateKeys, userId };
  }

  async importKeys(backup: KeyBackup): Promise<void> {
    if (backup.identityKeys) {
      this.identityKeys.set(backup.userId ?? 'imported', backup.identityKeys);
    }
    Object.entries(backup.aggregateKeys).forEach(([id, key]) => {
      this.aggregateKeys.set(id, key);
    });
  }

  async clearAll(): Promise<void> {
    this.identityKeys.clear();
    this.aggregateKeys.clear();
  }
}
