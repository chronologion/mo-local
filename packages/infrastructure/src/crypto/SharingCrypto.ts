import { CryptoServicePort } from '@mo/application';
import { ECIES_EPHEMERAL_LENGTH } from './eciesEnvelope';

const CURVE = 'P-256';

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
  constructor(private readonly crypto: CryptoServicePort) {}

  async deriveSharedSecret(
    privateKey: Uint8Array,
    peerPublicKey: Uint8Array
  ): Promise<Uint8Array> {
    if (peerPublicKey.length !== ECIES_EPHEMERAL_LENGTH) {
      throw new Error('Invalid peer public key length');
    }

    const subtle = (globalThis.crypto ?? undefined)?.subtle;
    if (!subtle) {
      throw new Error('WebCrypto not available');
    }
    const privateBytes = new Uint8Array(privateKey);
    const publicBytes = new Uint8Array(peerPublicKey);

    const privateKeyHandle = await subtle.importKey(
      'pkcs8',
      privateBytes,
      { name: 'ECDH', namedCurve: CURVE },
      false,
      ['deriveBits']
    );
    const publicKeyHandle = await subtle.importKey(
      'raw',
      publicBytes,
      { name: 'ECDH', namedCurve: CURVE },
      false,
      []
    );

    const bits = await subtle.deriveBits(
      { name: 'ECDH', public: publicKeyHandle },
      privateKeyHandle,
      256
    );
    return new Uint8Array(bits);
  }

  async wrapForRecipient(params: WrapParams): Promise<Uint8Array> {
    const sharedSecret = await this.deriveSharedSecret(
      params.senderPrivateKey,
      params.recipientPublicKey
    );
    const wrappingKey = await this.crypto.deriveKey(sharedSecret, 'kgoal-wrap');
    return this.crypto.encrypt(params.keyToWrap, wrappingKey);
  }

  async unwrapFromSender(params: UnwrapParams): Promise<Uint8Array> {
    const sharedSecret = await this.deriveSharedSecret(
      params.recipientPrivateKey,
      params.senderPublicKey
    );
    const wrappingKey = await this.crypto.deriveKey(sharedSecret, 'kgoal-wrap');
    return this.crypto.decrypt(params.wrappedKey, wrappingKey);
  }
}
