import { CryptoServicePort, KeyStorePort, KeyPair } from '@mo/application';
import { SharingCrypto } from './SharingCrypto';
import { KeyringManager } from './KeyringManager';

type ShareParams = {
  goalId: string;
  senderKeyPair: KeyPair;
  recipientPublicKey: Uint8Array;
};

type AcceptParams = {
  goalId: string;
  wrappedKey: Uint8Array;
  senderPublicKey: Uint8Array;
  recipientKeyPair: KeyPair;
};

/**
 * Manages per-aggregate (goal) encryption keys and sharing flows.
 * Key rotation is not implemented yet; idempotent create/accept guards against accidental overwrites.
 */
export class AggregateKeyManager {
  constructor(
    private readonly keyStore: KeyStorePort,
    private readonly crypto: CryptoServicePort,
    private readonly sharing: SharingCrypto,
    private readonly keyringManager?: KeyringManager
  ) {}

  async createForOwner(goalId: string): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(goalId);
    if (existing) {
      return existing;
    }

    const kGoal = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(goalId, kGoal);
    if (this.keyringManager) {
      await this.keyringManager.createInitialUpdate(goalId, kGoal, Date.now());
    }
    return kGoal;
  }

  async get(goalId: string): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(goalId);
    if (!existing) {
      throw new Error(`Missing aggregate key for ${goalId}`);
    }
    return existing;
  }

  async wrapForUser(params: ShareParams): Promise<{
    wrappedKey: Uint8Array;
    senderPublicKey: Uint8Array;
  }> {
    const kGoal = await this.get(params.goalId);
    const wrappedKey = await this.sharing.wrapForRecipient({
      keyToWrap: kGoal,
      senderPrivateKey: params.senderKeyPair.privateKey,
      recipientPublicKey: params.recipientPublicKey,
    });

    return {
      wrappedKey,
      senderPublicKey: params.senderKeyPair.publicKey,
    };
  }

  async acceptShared(params: AcceptParams): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(params.goalId);
    if (existing) {
      return existing;
    }

    const kGoal = await this.sharing.unwrapFromSender({
      wrappedKey: params.wrappedKey,
      senderPublicKey: params.senderPublicKey,
      recipientPrivateKey: params.recipientKeyPair.privateKey,
    });

    await this.keyStore.saveAggregateKey(params.goalId, kGoal);
    return kGoal;
  }
}
