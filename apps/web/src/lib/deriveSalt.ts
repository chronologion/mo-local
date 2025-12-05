export const generateRandomSalt = (length = 32): Uint8Array => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Web Crypto API unavailable for salt generation');
  }
  const salt = new Uint8Array(length);
  cryptoApi.getRandomValues(salt);
  return salt;
};

export const encodeSalt = (salt: Uint8Array): string =>
  btoa(String.fromCharCode(...Array.from(salt)));

export const decodeSalt = (saltB64: string): Uint8Array =>
  Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));

/**
 * Legacy deterministic salt derived from userId. Only used for migration of
 * pre-randomized salts.
 */
export const deriveLegacySaltForUser = async (
  userId: string
): Promise<Uint8Array> => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API unavailable for salt derivation');
  }
  const data = new TextEncoder().encode(`mo-local-salt:${userId}`);
  const hash = await cryptoApi.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
};
