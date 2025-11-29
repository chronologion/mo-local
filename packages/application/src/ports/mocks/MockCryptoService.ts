import { randomBytes, createHash } from 'node:crypto';
import { ICryptoService } from '../ICryptoService';
import { SymmetricKey, KeyPair } from '../types';

const xorBytes = (data: Uint8Array, key: Uint8Array): Uint8Array => {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
};

const deriveKeyBytes = (master: Uint8Array, context: string): Uint8Array => {
  const hash = createHash('sha256');
  hash.update(master);
  hash.update(context);
  return hash.digest();
};

/**
 * Non-cryptographic mock; suitable only for tests.
 */
export class MockCryptoService implements ICryptoService {
  async generateKey(): Promise<SymmetricKey> {
    return randomBytes(32);
  }

  async generateKeyPair(): Promise<KeyPair> {
    return {
      publicKey: randomBytes(32),
      privateKey: randomBytes(32),
    };
  }

  async encrypt(
    plaintext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array> {
    const effectiveKey = aad
      ? deriveKeyBytes(key, Buffer.from(aad).toString('hex'))
      : key;
    return xorBytes(plaintext, effectiveKey);
  }

  async decrypt(
    ciphertext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array> {
    return this.encrypt(ciphertext, key, aad);
  }

  async wrapKey(
    keyToWrap: Uint8Array,
    wrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    return xorBytes(keyToWrap, wrappingKey);
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    unwrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    return xorBytes(wrappedKey, unwrappingKey);
  }

  async deriveKey(
    masterKey: Uint8Array,
    context: string
  ): Promise<SymmetricKey> {
    return deriveKeyBytes(masterKey, context);
  }
}
