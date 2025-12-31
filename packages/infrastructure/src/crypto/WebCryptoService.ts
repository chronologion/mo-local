import { CryptoServicePort, KeyPair, SymmetricKey } from '@mo/application';
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
const ECDH_ALGO = 'ECDH';
const ECDSA_ALGO = 'ECDSA';
const HKDF_HASH = 'SHA-256';
const HKDF_ALGO = 'HKDF';
const PBKDF2_ALGO = 'PBKDF2';
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 600_000;
const AES_GCM_ALGO = 'AES-GCM';
const AES_GCM_KEY_BITS = 256;
const AES_GCM_TAG_LENGTH = 128;
const ECDSA_HASH = 'SHA-256';
const KEY_FORMAT_RAW = 'raw';
const KEY_FORMAT_PKCS8 = 'pkcs8';
const KEY_FORMAT_SPKI = 'spki';
const AES_GCM_USAGES: ReadonlyArray<KeyUsage> = ['encrypt', 'decrypt'];
const ECDH_DERIVE_USAGES: ReadonlyArray<KeyUsage> = ['deriveBits', 'deriveKey'];
const ECDH_DERIVE_KEY_USAGES: ReadonlyArray<KeyUsage> = ['deriveKey'];
const ECDSA_USAGES: ReadonlyArray<KeyUsage> = ['sign', 'verify'];
const DERIVE_KEY_USAGES: ReadonlyArray<KeyUsage> = ['deriveKey'];
const SIGN_KEY_USAGES: ReadonlyArray<KeyUsage> = ['sign'];
const VERIFY_KEY_USAGES: ReadonlyArray<KeyUsage> = ['verify'];
const DEFAULT_TEXT_ENCODER = new TextEncoder();
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
 * WebCrypto-based implementation of CryptoServicePort.
 * AES-GCM for payloads, HKDF (SHA-256) for derivation, ECDH P-256 for keypairs.
 * Wrapping uses AES-GCM with caller-provided symmetric key (e.g., derived from password).
 */
export class WebCryptoService implements CryptoServicePort {
  async generateKey(): Promise<SymmetricKey> {
    const key = await subtle.generateKey(
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      AES_GCM_USAGES
    );
    const exported = await subtle.exportKey(KEY_FORMAT_RAW, key);
    return new Uint8Array(exported);
  }

  async generateSigningKeyPair(): Promise<KeyPair> {
    const keyPair = await subtle.generateKey(
      { name: ECDSA_ALGO, namedCurve: ECDH_CURVE },
      true,
      ECDSA_USAGES
    );
    const publicKey = await subtle.exportKey(
      KEY_FORMAT_SPKI,
      keyPair.publicKey
    );
    const privateKey = await subtle.exportKey(
      KEY_FORMAT_PKCS8,
      keyPair.privateKey
    );
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
      { name: ECDH_ALGO, namedCurve: ECDH_CURVE },
      true,
      ECDH_DERIVE_USAGES
    );
    const publicKey = await subtle.exportKey(KEY_FORMAT_RAW, keyPair.publicKey);
    const privateKey = await subtle.exportKey(
      KEY_FORMAT_PKCS8,
      keyPair.privateKey
    );
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
      KEY_FORMAT_RAW,
      toArrayBuffer(key),
      { name: AES_GCM_ALGO },
      false,
      AES_GCM_USAGES
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
      KEY_FORMAT_RAW,
      toArrayBuffer(key),
      { name: AES_GCM_ALGO },
      false,
      AES_GCM_USAGES
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
      KEY_FORMAT_RAW,
      toArrayBuffer(recipientPublicKey),
      { name: ECDH_ALGO, namedCurve: ECDH_CURVE },
      false,
      []
    );
    const ephemeral = await subtle.generateKey(
      { name: ECDH_ALGO, namedCurve: ECDH_CURVE },
      true,
      ECDH_DERIVE_KEY_USAGES
    );
    const aesKey = await subtle.deriveKey(
      { name: ECDH_ALGO, public: publicKey },
      ephemeral.privateKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      AES_GCM_USAGES
    );
    const iv = cryptoApi.getRandomValues(new Uint8Array(ECIES_IV_LENGTH));
    const ciphertext = await subtle.encrypt(
      { name: AES_GCM_ALGO, iv, tagLength: AES_GCM_TAG_LENGTH },
      aesKey,
      toArrayBuffer(keyToWrap)
    );
    const ephemeralRaw = await subtle.exportKey(
      KEY_FORMAT_RAW,
      ephemeral.publicKey
    );

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
      KEY_FORMAT_PKCS8,
      toArrayBuffer(recipientPrivateKey),
      { name: ECDH_ALGO, namedCurve: ECDH_CURVE },
      false,
      ECDH_DERIVE_KEY_USAGES
    );
    const publicKey = await subtle.importKey(
      KEY_FORMAT_RAW,
      toArrayBuffer(ephemeralRaw),
      { name: ECDH_ALGO, namedCurve: ECDH_CURVE },
      false,
      []
    );
    const aesKey = await subtle.deriveKey(
      { name: ECDH_ALGO, public: publicKey },
      privateKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      AES_GCM_USAGES
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
      KEY_FORMAT_RAW,
      toArrayBuffer(masterKey),
      HKDF_ALGO,
      false,
      DERIVE_KEY_USAGES
    );

    const derived = await subtle.deriveKey(
      {
        name: HKDF_ALGO,
        hash: HKDF_HASH,
        salt: HKDF_SALT,
        info: DEFAULT_TEXT_ENCODER.encode(context),
      },
      baseKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      AES_GCM_USAGES
    );

    const exported = await subtle.exportKey(KEY_FORMAT_RAW, derived);
    return new Uint8Array(exported);
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<SymmetricKey> {
    const passwordKey = await subtle.importKey(
      KEY_FORMAT_RAW,
      DEFAULT_TEXT_ENCODER.encode(password),
      PBKDF2_ALGO,
      false,
      DERIVE_KEY_USAGES
    );

    const derived = await subtle.deriveKey(
      {
        name: PBKDF2_ALGO,
        salt: toArrayBuffer(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: PBKDF2_HASH,
      },
      passwordKey,
      { name: AES_GCM_ALGO, length: AES_GCM_KEY_BITS },
      true,
      AES_GCM_USAGES
    );

    const exported = await subtle.exportKey(KEY_FORMAT_RAW, derived);
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
      KEY_FORMAT_PKCS8,
      toArrayBuffer(privateKey),
      { name: ECDSA_ALGO, namedCurve: ECDH_CURVE },
      false,
      SIGN_KEY_USAGES
    );
    const signature = await subtle.sign(
      { name: ECDSA_ALGO, hash: ECDSA_HASH },
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
      KEY_FORMAT_SPKI,
      toArrayBuffer(publicKey),
      { name: ECDSA_ALGO, namedCurve: ECDH_CURVE },
      false,
      VERIFY_KEY_USAGES
    );
    return subtle.verify(
      { name: ECDSA_ALGO, hash: ECDSA_HASH },
      key,
      toArrayBuffer(signature),
      toArrayBuffer(data)
    );
  }
}
