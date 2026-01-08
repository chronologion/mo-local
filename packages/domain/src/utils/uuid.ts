/**
 * UUIDv4 generator (RFC 4122).
 *
 * Uses Web Crypto when available; falls back to Math.random only for
 * constrained test environments.
 */

type CryptoLike = {
  getRandomValues?(b: Uint8Array): Uint8Array;
  randomUUID?: () => string;
};

const getCrypto = (): CryptoLike | undefined => (globalThis as { crypto?: CryptoLike }).crypto;

export function uuidv4(): string {
  const cryptoObj = getCrypto();
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // version = 4 (0b0100)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // variant = RFC 4122 (10xxxxxx)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
