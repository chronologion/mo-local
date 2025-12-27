import type { IKeyringStore, KeyringState } from '@mo/application';

export class InMemoryKeyringStore implements IKeyringStore {
  private readonly keyrings = new Map<string, KeyringState>();

  async getKeyring(aggregateId: string): Promise<KeyringState | null> {
    return this.keyrings.get(aggregateId) ?? null;
  }

  async saveKeyring(aggregateId: string, keyring: KeyringState): Promise<void> {
    this.keyrings.set(aggregateId, keyring);
  }
}
