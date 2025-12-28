import { CryptoServicePort } from '../../../src/shared/ports/CryptoServicePort';
import { SymmetricKey, KeyPair } from '../../../src/shared/ports/types';

type CryptoLike = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
  subtle: {
    digest: (algorithm: string, data: ArrayBuffer) => Promise<ArrayBuffer>;
  };
};

const getCrypto = (): CryptoLike => {
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!cryptoLike) {
    throw new Error('Crypto not available');
  }
  return cryptoLike;
};

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
};

const sha256 = async (data: Uint8Array): Promise<Uint8Array> => {
  const digest = await getCrypto().subtle.digest(
    'SHA-256',
    data.buffer as ArrayBuffer
  );
  return new Uint8Array(digest);
};

const xorBytes = (data: Uint8Array, key: Uint8Array): Uint8Array => {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
};

const deriveKeyBytes = (master: Uint8Array, context: string): Uint8Array => {
  const ctx = new TextEncoder().encode(context);
  const combined = new Uint8Array(master.length + ctx.length);
  combined.set(master, 0);
  combined.set(ctx, master.length);
  // synchronous shim: simple xor fold for tests
  const out = new Uint8Array(32);
  for (let i = 0; i < combined.length; i += 1) {
    out[i % 32] ^= combined[i];
  }
  return out;
};

/**
 * Non-cryptographic mock; suitable only for tests.
 */
export class MockCryptoService implements CryptoServicePort {
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
    const encoder = new TextEncoder();
    const pwdBytes = encoder.encode(password);
    const input = new Uint8Array(pwdBytes.length + salt.length);
    input.set(pwdBytes, 0);
    input.set(salt, pwdBytes.length);
    const digest = await sha256(input);
    return digest;
  }

  async deriveSubKey(
    rootKey: SymmetricKey,
    info: 'remote' | 'local'
  ): Promise<SymmetricKey> {
    return this.deriveKey(rootKey, `subkey-${info}`);
  }

  async sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    // const encoder = new TextEncoder();
    const combined = new Uint8Array(data.length + privateKey.length);
    combined.set(data, 0);
    combined.set(privateKey, data.length);
    return sha256(combined);
  }

  async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    const combined = new Uint8Array(data.length + publicKey.length);
    combined.set(data, 0);
    combined.set(publicKey, data.length);
    const expected = await sha256(combined);
    return (
      expected.length === signature.length &&
      expected.every((value, index) => value === signature[index])
    );
  }
}
