/**
 * Minimal UUIDv7 generator, compatible with both browser and modern Node.
 *
 * - 48-bit millisecond timestamp in the high bits
 * - 12-bit monotonic counter for stable ordering within the same ms
 * - Remaining bits are random
 *
 * Uses Web Crypto (`crypto.getRandomValues`) when available; falls back to
 * `Math.random` only if necessary (e.g. in very constrained test environments).
 *
 * Note: we avoid `any` in types to comply with repo guidelines.
 */

type CryptoLike = {
  getRandomValues?(b: Uint8Array): Uint8Array;
};

let lastMs = 0;
let lastRandA = 0;

export function uuidv7(): string {
  const ms = Date.now();

  const bytes = new Uint8Array(16);

  // Prefer Web Crypto for randomness (browser + modern Node)
  const cryptoObj = (globalThis as { crypto?: CryptoLike }).crypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto (should not be used in production).
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // 48-bit unix_ts_ms (big-endian)
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // version = 7 (0b0111)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Optional monotonicity within the same ms via 12-bit rand_a
  let randA = ((bytes[6] & 0x0f) << 8) | bytes[7];
  if (ms === lastMs) {
    randA = (lastRandA + 1) & 0x0fff;
  }
  lastMs = ms;
  lastRandA = randA;
  bytes[6] = (bytes[6] & 0xf0) | ((randA >> 8) & 0x0f);
  bytes[7] = randA & 0xff;

  // variant = RFC 4122 (10xxxxxx)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

