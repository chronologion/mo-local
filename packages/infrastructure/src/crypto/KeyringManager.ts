import type { EncryptedEvent, CryptoServicePort, KeyStorePort, KeyringStorePort } from '@mo/application';
import { MissingKeyError } from '../errors';
import { Keyring } from './Keyring';

type KeyringUpdateResult = {
  epoch: number;
  keyringUpdate: Uint8Array;
};

export class KeyringManager {
  private readonly epochKeys = new Map<string, Map<number, Uint8Array>>();

  constructor(
    private readonly crypto: CryptoServicePort,
    private readonly keyStore: KeyStorePort,
    private readonly keyringStore: KeyringStorePort
  ) {}

  async createInitialUpdate(
    aggregateId: string,
    dek: Uint8Array,
    createdAt: number
  ): Promise<KeyringUpdateResult | null> {
    const existing = await this.keyringStore.getKeyring(aggregateId);
    if (existing) {
      return null;
    }
    const ownerKey = await this.deriveOwnerKey(aggregateId);
    const ownerEnvelope = await this.crypto.encrypt(dek, ownerKey);
    const keyring = Keyring.createInitial(aggregateId, createdAt, ownerEnvelope);
    await this.keyringStore.saveKeyring(aggregateId, keyring.toState());
    this.cacheKey(aggregateId, 0, dek);
    await this.keyStore.saveAggregateKey(aggregateId, dek);

    const encryptedKeyring = await this.crypto.encrypt(keyring.toBytes(), ownerKey);
    return {
      epoch: keyring.getCurrentEpoch(),
      keyringUpdate: encryptedKeyring,
    };
  }

  async ingestKeyringUpdate(aggregateId: string, update: Uint8Array): Promise<void> {
    const ownerKey = await this.deriveOwnerKey(aggregateId);
    const decrypted = await this.crypto.decrypt(update, ownerKey);
    const keyring = Keyring.fromBytes(decrypted);
    if (keyring.getAggregateId() !== aggregateId) {
      throw new Error(`Keyring aggregate mismatch for ${aggregateId}`);
    }
    await this.keyringStore.saveKeyring(aggregateId, keyring.toState());
    await this.cacheEpochKeys(aggregateId, keyring, ownerKey);
  }

  async resolveKeyForEvent(event: EncryptedEvent): Promise<Uint8Array> {
    if (event.keyringUpdate) {
      await this.ingestKeyringUpdate(event.aggregateId, event.keyringUpdate);
    }
    return this.resolveKeyForEpoch(event.aggregateId, event.epoch ?? 0);
  }

  async resolveKeyForEpoch(aggregateId: string, epoch: number | null): Promise<Uint8Array> {
    const epochId = epoch ?? 0;
    const cached = this.getCachedKey(aggregateId, epochId);
    if (cached) return cached;

    const keyringState = await this.keyringStore.getKeyring(aggregateId);
    if (keyringState) {
      const keyring = Keyring.fromState(keyringState);
      const ownerKey = await this.deriveOwnerKey(aggregateId);
      const epochRecord = keyring.getEpoch(epochId);
      if (!epochRecord) {
        throw new MissingKeyError(`Missing keyring epoch ${epochId} for ${aggregateId}`);
      }
      const dek = await this.crypto.decrypt(epochRecord.ownerEnvelope, ownerKey);
      this.cacheKey(aggregateId, epochId, dek);
      if (epochId === keyring.getCurrentEpoch()) {
        await this.keyStore.saveAggregateKey(aggregateId, dek);
      }
      return dek;
    }

    if (epochId === 0) {
      const fallback = await this.keyStore.getAggregateKey(aggregateId);
      if (fallback) {
        this.cacheKey(aggregateId, epochId, fallback);
        return fallback;
      }
    }

    throw new MissingKeyError(`Missing aggregate key for ${aggregateId} (epoch ${epochId})`);
  }

  async getCurrentEpoch(aggregateId: string): Promise<number> {
    const keyringState = await this.keyringStore.getKeyring(aggregateId);
    return keyringState?.currentEpoch ?? 0;
  }

  private async cacheEpochKeys(aggregateId: string, keyring: Keyring, ownerKey: Uint8Array): Promise<void> {
    for (const epoch of keyring.listEpochs()) {
      if (this.getCachedKey(aggregateId, epoch.epochId)) {
        continue;
      }
      const dek = await this.crypto.decrypt(epoch.ownerEnvelope, ownerKey);
      this.cacheKey(aggregateId, epoch.epochId, dek);
      if (epoch.epochId === keyring.getCurrentEpoch()) {
        await this.keyStore.saveAggregateKey(aggregateId, dek);
      }
    }
  }

  private cacheKey(aggregateId: string, epoch: number, key: Uint8Array): void {
    const epochs = this.epochKeys.get(aggregateId) ?? new Map<number, Uint8Array>();
    epochs.set(epoch, new Uint8Array(key));
    this.epochKeys.set(aggregateId, epochs);
  }

  private getCachedKey(aggregateId: string, epoch: number): Uint8Array | null {
    const epochs = this.epochKeys.get(aggregateId);
    return epochs?.get(epoch) ?? null;
  }

  private async deriveOwnerKey(aggregateId: string): Promise<Uint8Array> {
    const masterKey = this.keyStore.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not set');
    }
    return this.crypto.deriveKey(masterKey, `keyring:${aggregateId}`);
  }
}
