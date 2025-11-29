import { IKeyStore } from '../IKeyStore';
import { IdentityKeys, KeyBackup } from '../types';

export class InMemoryKeyStore implements IKeyStore {
  private identityKeys = new Map<string, IdentityKeys>();
  private aggregateKeys = new Map<string, Uint8Array>();

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

    const identityKeys =
      this.identityKeys.size > 0
        ? this.identityKeys.values().next().value
        : {
            signingPrivateKey: new Uint8Array(),
            signingPublicKey: new Uint8Array(),
            encryptionPrivateKey: new Uint8Array(),
            encryptionPublicKey: new Uint8Array(),
          };

    return { identityKeys, aggregateKeys };
  }

  async importKeys(backup: KeyBackup): Promise<void> {
    this.identityKeys.set('imported', backup.identityKeys);
    Object.entries(backup.aggregateKeys).forEach(([id, key]) => {
      this.aggregateKeys.set(id, key);
    });
  }
}
