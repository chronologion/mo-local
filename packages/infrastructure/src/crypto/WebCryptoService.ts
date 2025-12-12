import { ICryptoService, KeyPair, SymmetricKey } from '@mo/application';
import {
  decodeEnvelope,
  encodeEnvelope,
  ECIES_EPHEMERAL_LENGTH,
  ECIES_IV_LENGTH,
} from './eciesEnvelope';

const resolveCrypto = (): Crypto => {
  const cryptoLike = globalThis.crypto;
  if (!cryptoLike?.subtle || !cryptoLike.getRandomValues) {
    throw new Error('Web Crypto API is not available');
  }
  return cryptoLike;
};

const cryptoApi = resolveCrypto();
const subtle = cryptoApi.subtle;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const HKDF_SALT = new TextEncoder().encode('mo-local-v1');
const ECDH_CURVE = 'P-256';
const HKDF_HASH = 'SHA-256';
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 600_000;
const AES_GCM_ALGO = 'AES-GCM';
const AES_GCM_KEY_BITS = 256;
const AES_GCM_TAG_LENGTH = 128;
const ECDSA_HASH = 'SHA-256';
const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
};

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
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await subtle.exportKey('raw', key);
    return new Uint8Array(exported);
  }

  async generateSigningKeyPair(): Promise<KeyPair> {
    const keyPair = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: ECDH_CURVE },
      true,
      ['sign', 'verify']
    );
    const publicKey = await subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await subtle.exportKey('pkcs8', keyPair.privateKey);
    return {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    };
  }

  async generateEncryptionKeyPair(): Promise<KeyPair> {
    return this.generateKeyPair();
  }

  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: ECDH_CURVE },
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
    const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));
    const cryptoKey = await subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: AES_GCM_ALGO },
      false,
      ['encrypt']
    );

    const params: AesGcmParams & { additionalData?: BufferSource } = {
      name: AES_GCM_ALGO,
      iv,
      tagLength: AES_GCM_TAG_LENGTH,
    };
    if (aad) {
      params.additionalData = new Uint8Array(aad);
    }

    const ciphertext = await subtle.encrypt(
      params,
      cryptoKey,
      toArrayBuffer(plaintext)
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
      toArrayBuffer(key),
      { name: AES_GCM_ALGO },
      false,
      ['decrypt']
    );

    const params: AesGcmParams & { additionalData?: BufferSource } = {
      name: AES_GCM_ALGO,
      iv,
      tagLength: AES_GCM_TAG_LENGTH,
    };
    if (aad) {
      params.additionalData = new Uint8Array(aad);
    }

    const plaintext = await subtle.decrypt(
      params,
      cryptoKey,
      toArrayBuffer(payload)
    );

    return new Uint8Array(plaintext);
  }

  async wrapKey(
    keyToWrap: Uint8Array,
    recipientPublicKey: Uint8Array
  ): Promise<Uint8Array> {
    ensureKeyLength(keyToWrap);
    if (recipientPublicKey.length !== ECIES_EPHEMERAL_LENGTH) {
      throw new Error('Invalid recipient public key length');
    }

    const publicKey = await subtle.importKey(
      'raw',
      toArrayBuffer(recipientPublicKey),
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      false,
      []
    );
    const ephemeral = await subtle.generateKey(
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      true,
      ['deriveKey']
    );
    const aesKey = await subtle.deriveKey(
      { name: 'ECDH', public: publicKey },
      ephemeral.privateKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      ['encrypt', 'decrypt']
    );
    const iv = cryptoApi.getRandomValues(new Uint8Array(ECIES_IV_LENGTH));
    const ciphertext = await subtle.encrypt(
      { name: AES_GCM_ALGO, iv, tagLength: AES_GCM_TAG_LENGTH },
      aesKey,
      toArrayBuffer(keyToWrap)
    );
    const ephemeralRaw = await subtle.exportKey('raw', ephemeral.publicKey);

    return encodeEnvelope(
      new Uint8Array(ephemeralRaw),
      iv,
      new Uint8Array(ciphertext)
    );
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    recipientPrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    const { ephemeralRaw, iv, payload } = decodeEnvelope(wrappedKey);
    const ivCopy = new Uint8Array(iv);

    const privateKey = await subtle.importKey(
      'pkcs8',
      toArrayBuffer(recipientPrivateKey),
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      false,
      ['deriveKey']
    );
    const publicKey = await subtle.importKey(
      'raw',
      toArrayBuffer(ephemeralRaw),
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      false,
      []
    );
    const aesKey = await subtle.deriveKey(
      { name: 'ECDH', public: publicKey },
      privateKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      ['decrypt']
    );

    const plaintext = await subtle.decrypt(
      { name: AES_GCM_ALGO, iv: ivCopy, tagLength: AES_GCM_TAG_LENGTH },
      aesKey,
      toArrayBuffer(payload)
    );
    const result = new Uint8Array(plaintext);
    ensureKeyLength(result);
    return result;
  }

  async deriveKey(
    masterKey: Uint8Array,
    context: string
  ): Promise<SymmetricKey> {
    ensureKeyLength(masterKey);
    const baseKey = await subtle.importKey(
      'raw',
      toArrayBuffer(masterKey),
      'HKDF',
      false,
      ['deriveKey']
    );

    const derived = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: HKDF_HASH,
        salt: HKDF_SALT,
        info: new TextEncoder().encode(context),
      },
      baseKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await subtle.exportKey('raw', derived);
    return new Uint8Array(exported);
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<SymmetricKey> {
    const encoder = new TextEncoder();
    const passwordKey = await subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const derived = await subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: PBKDF2_HASH,
      },
      passwordKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await subtle.exportKey('raw', derived);
    return new Uint8Array(exported);
  }

  async deriveSubKey(
    rootKey: SymmetricKey,
    info: 'remote' | 'local'
  ): Promise<SymmetricKey> {
    return this.deriveKey(rootKey, `subkey-${info}`);
  }

  async sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const key = await subtle.importKey(
      'pkcs8',
      toArrayBuffer(privateKey),
      { name: 'ECDSA', namedCurve: ECDH_CURVE },
      false,
      ['sign']
    );
    const signature = await subtle.sign(
      { name: 'ECDSA', hash: ECDSA_HASH },
      key,
      toArrayBuffer(data)
    );
    return new Uint8Array(signature);
  }

  async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    const key = await subtle.importKey(
      'spki',
      toArrayBuffer(publicKey),
      { name: 'ECDSA', namedCurve: ECDH_CURVE },
      false,
      ['verify']
    );
    return subtle.verify(
      { name: 'ECDSA', hash: ECDSA_HASH },
      key,
      toArrayBuffer(signature),
      toArrayBuffer(data)
    );
  }
}
