import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { ICryptoService, KeyPair, SymmetricKey } from '@mo/application';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const AES_ALGO = 'aes-256-gcm';
const DERIVE_LENGTH = 32;
const HKDF_SALT = Buffer.from('mo-local-v1', 'utf8');
const CURVE = 'prime256v1';

const toBuffer = (input: Uint8Array): Buffer =>
  Buffer.isBuffer(input) ? input : Buffer.from(input);

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
    const ecdh = createECDH(CURVE);
    ecdh.generateKeys();
    return {
      publicKey: new Uint8Array(ecdh.getPublicKey()),
      privateKey: new Uint8Array(ecdh.getPrivateKey()),
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
    wrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    assertKeyLength(wrappingKey);
    return this.encrypt(keyToWrap, wrappingKey);
  }

  async unwrapKey(
    wrappedKey: Uint8Array,
    unwrappingKey: Uint8Array
  ): Promise<Uint8Array> {
    assertKeyLength(unwrappingKey);
    return this.decrypt(wrappedKey, unwrappingKey);
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
}
