import { KeyPair, SymmetricKey } from './types';

/**
 * Cryptographic primitives used by the Application layer.
 *
 * Implementations may use WebCrypto, SubtleCrypto, or platform-native libs,
 * but must present a pure Uint8Array-based API to keep the domain portable.
 */
export interface ICryptoService {
  // Key generation
  generateKey(): Promise<SymmetricKey>;
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

  // Key wrapping
  wrapKey(keyToWrap: Uint8Array, wrappingKey: Uint8Array): Promise<Uint8Array>;
  unwrapKey(
    wrappedKey: Uint8Array,
    unwrappingKey: Uint8Array
  ): Promise<Uint8Array>;

  // Key derivation
  deriveKey(masterKey: Uint8Array, context: string): Promise<SymmetricKey>;
}
