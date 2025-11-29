import { webcrypto } from 'node:crypto';
import { ICryptoService, KeyPair, SymmetricKey } from '@mo/application';

const subtle = webcrypto.subtle;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const HKDF_SALT = new TextEncoder().encode('mo-local-v1');
const CURVE = 'P-256';

const ensureKeyLength = (key: Uint8Array): void => {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`);
  }
};

/**
 * WebCrypto-based implementation of ICryptoService.
 * AES-GCM for payloads, HKDF (SHA-256) for derivation, ECDH P-256 for keypairs.
 * Wrapping uses AES-GCM with caller-provided symmetric key (e.g., derived from password).
 */
export class WebCryptoService implements ICryptoService {
  async generateKey(): Promise<SymmetricKey> {
    const key = await subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await subtle.exportKey('raw', key);
    return new Uint8Array(exported);
  }

  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: CURVE },
      true,
      ['deriveBits', 'deriveKey']
    );
    const publicKey = await subtle.exportKey('raw', keyPair.publicKey);
    const privateKey = await subtle.exportKey('pkcs8', keyPair.privateKey);
    return {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    };
  }

  async encrypt(
    plaintext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array> {
    ensureKeyLength(key);
    const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const cryptoKey = await subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const ciphertext = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad,
        tagLength: 128,
      },
      cryptoKey,
      plaintext
    );

    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result;
  }

  async decrypt(
    ciphertext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array> {
    ensureKeyLength(key);
    if (ciphertext.length <= IV_LENGTH) {
      throw new Error('Ciphertext too short');
    }
    const iv = ciphertext.slice(0, IV_LENGTH);
    const payload = ciphertext.slice(IV_LENGTH);

    const cryptoKey = await subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad,
        tagLength: 128,
      },
      cryptoKey,
      payload
    );

    return new Uint8Array(plaintext);
  }

  async wrapKey(
    keyToWrap: Uint8Array,
    wrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    ensureKeyLength(wrappingKey);
    return this.encrypt(keyToWrap, wrappingKey);
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    unwrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    ensureKeyLength(unwrappingKey);
    return this.decrypt(wrappedKey, unwrappingKey);
  }

  async deriveKey(
    masterKey: Uint8Array,
    context: string
  ): Promise<SymmetricKey> {
    ensureKeyLength(masterKey);
    const baseKey = await subtle.importKey('raw', masterKey, 'HKDF', false, [
      'deriveKey',
    ]);

    const derived = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HKDF_SALT,
        info: new TextEncoder().encode(context),
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await subtle.exportKey('raw', derived);
    return new Uint8Array(exported);
  }
}
