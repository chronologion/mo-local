import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
  webcrypto,
} from 'node:crypto';
import { ICryptoService, KeyPair, SymmetricKey } from '@mo/application';
import {
  decodeEnvelope,
  encodeEnvelope,
  ECIES_EPHEMERAL_LENGTH,
  ECIES_IV_LENGTH,
} from './eciesEnvelope';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const AES_ALGO = 'aes-256-gcm';
const DERIVE_LENGTH = 32;
const HKDF_SALT = Buffer.from('mo-local-v1', 'utf8');
const CURVE = 'P-256';

const toBuffer = (input: Uint8Array): Buffer =>
  Buffer.isBuffer(input) ? input : Buffer.from(input);

const toArrayBuffer = (input: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  return buffer;
};

const assertKeyLength = (key: Uint8Array): void => {
  if (key.length !== DERIVE_LENGTH) {
    throw new Error(`Invalid key length: expected ${DERIVE_LENGTH} bytes`);
  }
};

/**
 * Node-backed crypto service using AES-GCM for payloads and HKDF for derivation.
 * AES-KW is only used in KeyWrapping; this service keeps to AES-GCM.
 */
export class NodeCryptoService implements ICryptoService {
  async generateKey(): Promise<SymmetricKey> {
    return new Uint8Array(randomBytes(DERIVE_LENGTH));
  }

  async generateKeyPair(): Promise<KeyPair> {
    return this.generateEncryptionKeyPair();
  }

  async generateEncryptionKeyPair(): Promise<KeyPair> {
    const keyPair = await webcrypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: CURVE },
      true,
      ['deriveKey', 'deriveBits']
    );
    const publicKey = await webcrypto.subtle.exportKey(
      'raw',
      keyPair.publicKey
    );
    const privateKey = await webcrypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey
    );
    return {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    };
  }

  async generateSigningKeyPair(): Promise<KeyPair> {
    const keyPair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: CURVE },
      true,
      ['sign', 'verify']
    );
    const publicKey = await webcrypto.subtle.exportKey(
      'spki',
      keyPair.publicKey
    );
    const privateKey = await webcrypto.subtle.exportKey(
      'pkcs8',
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
    assertKeyLength(key);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGO, toBuffer(key), iv);
    if (aad) {
      cipher.setAAD(toBuffer(aad));
    }

    const ciphertext = Buffer.concat([
      cipher.update(toBuffer(plaintext)),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return new Uint8Array(Buffer.concat([iv, ciphertext, tag]));
  }

  async decrypt(
    ciphertext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array> {
    assertKeyLength(key);
    const data = toBuffer(ciphertext);
    if (data.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('Ciphertext too short');
    }
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(data.length - TAG_LENGTH);
    const payload = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

    const decipher = createDecipheriv(AES_ALGO, toBuffer(key), iv);
    if (aad) {
      decipher.setAAD(toBuffer(aad));
    }
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(payload),
      decipher.final(),
    ]);
    return new Uint8Array(plaintext);
  }

  async wrapKey(
    keyToWrap: Uint8Array,
    recipientPublicKey: Uint8Array
  ): Promise<Uint8Array> {
    assertKeyLength(keyToWrap);
    if (recipientPublicKey.length !== ECIES_EPHEMERAL_LENGTH) {
      throw new Error('Invalid recipient public key length');
    }
    const publicKey = await webcrypto.subtle.importKey(
      'raw',
      toArrayBuffer(recipientPublicKey),
      { name: 'ECDH', namedCurve: CURVE },
      false,
      []
    );
    const ephemeral = await webcrypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: CURVE },
      true,
      ['deriveKey']
    );

    const aesKey = await webcrypto.subtle.deriveKey(
      { name: 'ECDH', public: publicKey },
      ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = randomBytes(ECIES_IV_LENGTH);
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      toArrayBuffer(keyToWrap)
    );
    const ephemeralRaw = await webcrypto.subtle.exportKey(
      'raw',
      ephemeral.publicKey
    );

    return encodeEnvelope(
      new Uint8Array(ephemeralRaw),
      new Uint8Array(iv),
      new Uint8Array(ciphertext)
    );
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    recipientPrivateKey: Uint8Array
  ): Promise<Uint8Array> {
    const { ephemeralRaw, iv, payload } = decodeEnvelope(wrappedKey);

    const privateKey = await webcrypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(recipientPrivateKey),
      { name: 'ECDH', namedCurve: CURVE },
      false,
      ['deriveKey']
    );
    const publicKey = await webcrypto.subtle.importKey(
      'raw',
      toArrayBuffer(ephemeralRaw),
      { name: 'ECDH', namedCurve: CURVE },
      false,
      []
    );

    const aesKey = await webcrypto.subtle.deriveKey(
      { name: 'ECDH', public: publicKey },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );

    const plaintext = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
      aesKey,
      toArrayBuffer(payload)
    );
    const result = new Uint8Array(plaintext);
    assertKeyLength(result);
    return result;
  }

  async deriveKey(
    masterKey: Uint8Array,
    context: string
  ): Promise<SymmetricKey> {
    assertKeyLength(masterKey);
    const derived = hkdfSync(
      'sha256',
      toBuffer(masterKey),
      HKDF_SALT,
      Buffer.from(context, 'utf8'),
      DERIVE_LENGTH
    );
    return new Uint8Array(derived);
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<SymmetricKey> {
    const derived = pbkdf2Sync(
      password,
      toBuffer(salt),
      600_000,
      DERIVE_LENGTH,
      'sha256'
    );
    return new Uint8Array(derived);
  }

  async deriveSubKey(
    rootKey: SymmetricKey,
    info: 'remote' | 'local'
  ): Promise<SymmetricKey> {
    return this.deriveKey(rootKey, `subkey-${info}`);
  }

  async sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const key = await webcrypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(privateKey),
      { name: 'ECDSA', namedCurve: CURVE },
      false,
      ['sign']
    );
    const signature = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
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
    const key = await webcrypto.subtle.importKey(
      'spki',
      toArrayBuffer(publicKey),
      { name: 'ECDSA', namedCurve: CURVE },
      false,
      ['verify']
    );
    return webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      toArrayBuffer(signature),
      toArrayBuffer(data)
    );
  }
}
