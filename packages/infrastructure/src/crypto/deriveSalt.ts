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

export const decodeSalt = (saltB64: string): Uint8Array => {
  const decoded = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  if (decoded.length < 16) {
    throw new Error(
      'Invalid salt: minimum 16 bytes required per NIST SP 800-132'
    );
  }
  if (decoded.length > 64) {
    throw new Error('Invalid salt: maximum 64 bytes exceeded');
  }
  return decoded;
};
