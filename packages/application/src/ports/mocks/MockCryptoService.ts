import { randomBytes, createHash, pbkdf2Sync } from 'node:crypto';
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

  async generateSigningKeyPair(): Promise<KeyPair> {
    return this.generateKeyPair();
  }

  async generateEncryptionKeyPair(): Promise<KeyPair> {
    return this.generateKeyPair();
  }

  async generateKeyPair(): Promise<KeyPair> {
    const key = randomBytes(32);
    return {
      publicKey: key,
      privateKey: key,
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
    recipientPublicKey: Uint8Array
  ): Promise<Uint8Array> {
    return xorBytes(keyToWrap, recipientPublicKey);
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    recipientPrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    return xorBytes(wrappedKey, recipientPrivateKey);
  }

  async deriveKey(
    masterKey: Uint8Array,
    context: string
  ): Promise<SymmetricKey> {
    return deriveKeyBytes(masterKey, context);
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<SymmetricKey> {
    return pbkdf2Sync(password, salt, 10_000, 32, 'sha256'); // deterministic mock; lower cost for tests
  }

  async deriveSubKey(
    rootKey: SymmetricKey,
    info: 'remote' | 'local'
  ): Promise<SymmetricKey> {
    return this.deriveKey(rootKey, `subkey-${info}`);
  }

  async sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const hash = createHash('sha256');
    hash.update(data);
    hash.update(privateKey);
    return hash.digest();
  }

  async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    const hash = createHash('sha256');
    hash.update(data);
    hash.update(publicKey);
    const expected = hash.digest();
    return (
      expected.length === signature.length &&
      expected.every((value, index) => value === signature[index])
    );
  }
}
