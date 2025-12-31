import { KeyPair, SymmetricKey } from './types';

/**
 * Cryptographic primitives used by the Application layer.
 *
 * Implementations may use WebCrypto, SubtleCrypto, or platform-native libs,
 * but must present a pure Uint8Array-based API to keep the domain portable.
 */
export interface CryptoServicePort {
  // Key generation
  generateKey(): Promise<SymmetricKey>;
  generateSigningKeyPair(): Promise<KeyPair>;
  generateEncryptionKeyPair(): Promise<KeyPair>;
  generateKeyPair(): Promise<KeyPair>;

  // AEAD encryption/decryption
  encrypt(
    plaintext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array>;
  decrypt(
    ciphertext: Uint8Array,
    key: SymmetricKey,
    aad?: Uint8Array
  ): Promise<Uint8Array>;

  // Identity-based key wrapping (ECIES-style using recipient public key)
  wrapKey(
    keyToWrap: Uint8Array,
    recipientPublicKey: Uint8Array
  ): Promise<Uint8Array>;
  unwrapKey(
    wrappedKey: Uint8Array,
    recipientPrivateKey: Uint8Array
  ): Promise<Uint8Array>;

  // Signatures (ECDSA P-256)
  sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
  verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean>;

  // Key derivation
  deriveKey(masterKey: Uint8Array, context: string): Promise<SymmetricKey>;

  // Password-based key derivation (PBKDF2)
  deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<SymmetricKey>;

  // Deterministic fan-out for per-goal subkeys
  deriveSubKey(
    rootKey: SymmetricKey,
    info: 'remote' | 'local'
  ): Promise<SymmetricKey>;
}
