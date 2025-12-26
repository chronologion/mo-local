import type { IdentityKeys, IKeyStore, KeyBackup } from '@mo/application';

export class InMemoryKeyStore implements IKeyStore {
  private readonly identityKeys = new Map<string, IdentityKeys>();
  private readonly keys = new Map<string, Uint8Array>();
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

  async saveAggregateKey(id: string, key: Uint8Array): Promise<void> {
    this.keys.set(id, key);
  }

  async getAggregateKey(id: string): Promise<Uint8Array | null> {
    return this.keys.get(id) ?? null;
  }

  async exportKeys(): Promise<KeyBackup> {
    return {
      identityKeys: null,
      aggregateKeys: Object.fromEntries(this.keys.entries()),
    };
  }

  async importKeys(backup: KeyBackup): Promise<void> {
    this.keys.clear();
    Object.entries(backup.aggregateKeys).forEach(([id, key]) => {
      this.keys.set(id, key);
    });
  }

  async clearAll(): Promise<void> {
    this.identityKeys.clear();
    this.keys.clear();
  }
}
