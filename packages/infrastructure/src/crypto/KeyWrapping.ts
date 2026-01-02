const KEY_LENGTH = 32;
const WRAPPED_LENGTH = KEY_LENGTH + 8; // AES-KW adds 64-bit integrity block

const getWebCrypto = (): Crypto => {
  if (typeof globalThis.crypto === 'undefined') {
    throw new Error('WebCrypto is not available in this environment');
  }
  return globalThis.crypto;
};

const toArrayBuffer = (input: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  return buffer;
};

const ensureKeyLength = (key: Uint8Array): void => {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`);
  }
};

/**
 * AES-KW wrapping/unwrapping helpers using WebCrypto.
 * Wrapping key is provided by caller (e.g., password-derived or identity key).
 */
export class KeyWrapping {
  static async wrapKey(keyToWrap: Uint8Array, wrappingKey: Uint8Array): Promise<Uint8Array> {
    ensureKeyLength(keyToWrap);
    ensureKeyLength(wrappingKey);

    const subtle = getWebCrypto().subtle;
    const keyMaterial = await subtle.importKey('raw', toArrayBuffer(keyToWrap), { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ]);
    const wrapKey = await subtle.importKey('raw', toArrayBuffer(wrappingKey), { name: 'AES-KW' }, false, ['wrapKey']);

    const wrapped = await subtle.wrapKey('raw', keyMaterial, wrapKey, 'AES-KW');
    return new Uint8Array(wrapped);
  }

  static async unwrapKey(wrappedKey: Uint8Array, unwrappingKey: Uint8Array): Promise<Uint8Array> {
    ensureKeyLength(unwrappingKey);
    if (wrappedKey.length !== WRAPPED_LENGTH) {
      throw new Error(`Invalid wrapped key length: expected ${WRAPPED_LENGTH}`);
    }

    const subtle = getWebCrypto().subtle;
    const unwrapKey = await subtle.importKey('raw', toArrayBuffer(unwrappingKey), { name: 'AES-KW' }, false, [
      'unwrapKey',
    ]);

    const unwrapped = await subtle.unwrapKey(
      'raw',
      toArrayBuffer(wrappedKey),
      unwrapKey,
      'AES-KW',
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await subtle.exportKey('raw', unwrapped);
    ensureKeyLength(new Uint8Array(exported));
    return new Uint8Array(exported);
  }

  static generateWrappingKey(): Uint8Array {
    const bytes = new Uint8Array(KEY_LENGTH);
    getWebCrypto().getRandomValues(bytes);
    return bytes;
  }
}
