import { createECDH } from 'node:crypto';
import { ICryptoService } from '@mo/application';

type WrapParams = {
  keyToWrap: Uint8Array;
  senderPrivateKey: Uint8Array;
  recipientPublicKey: Uint8Array;
};

type UnwrapParams = {
  wrappedKey: Uint8Array;
  senderPublicKey: Uint8Array;
  recipientPrivateKey: Uint8Array;
};

/**
 * Sharing helpers for wrapping K_goal with the recipient's public key using ECDH.
 */
export class SharingCrypto {
  constructor(private readonly crypto: ICryptoService) {}

  deriveSharedSecret(
    privateKey: Uint8Array,
    peerPublicKey: Uint8Array
  ): Uint8Array {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey);
    return new Uint8Array(ecdh.computeSecret(peerPublicKey));
  }

  async wrapForRecipient(params: WrapParams): Promise<Uint8Array> {
    const sharedSecret = this.deriveSharedSecret(
      params.senderPrivateKey,
      params.recipientPublicKey
    );
    const wrappingKey = await this.crypto.deriveKey(sharedSecret, 'kgoal-wrap');
    return this.crypto.encrypt(params.keyToWrap, wrappingKey);
  }

  async unwrapFromSender(params: UnwrapParams): Promise<Uint8Array> {
    const sharedSecret = this.deriveSharedSecret(
      params.recipientPrivateKey,
      params.senderPublicKey
    );
    const wrappingKey = await this.crypto.deriveKey(sharedSecret, 'kgoal-wrap');
    return this.crypto.decrypt(params.wrappedKey, wrappingKey);
  }
}
