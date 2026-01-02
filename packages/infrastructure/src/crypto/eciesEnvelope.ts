/**
 * Shared serialization helpers for ECIES-wrapped keys.
 * Layout: [ephemeralRaw(65) || iv(12) || ciphertext+tag]
 */
export const ECIES_EPHEMERAL_LENGTH = 65;
export const ECIES_IV_LENGTH = 12;

type EnvelopeParts = {
  ephemeralRaw: Uint8Array;
  iv: Uint8Array;
  payload: Uint8Array;
};

export const encodeEnvelope = (ephemeralRaw: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array => {
  if (ephemeralRaw.length !== ECIES_EPHEMERAL_LENGTH) {
    throw new Error('Invalid ephemeral public key length');
  }
  if (iv.length !== ECIES_IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  const out = new Uint8Array(ECIES_EPHEMERAL_LENGTH + ECIES_IV_LENGTH + ciphertext.length);
  out.set(ephemeralRaw, 0);
  out.set(iv, ECIES_EPHEMERAL_LENGTH);
  out.set(ciphertext, ECIES_EPHEMERAL_LENGTH + ECIES_IV_LENGTH);
  return out;
};

export const decodeEnvelope = (wrappedKey: Uint8Array): EnvelopeParts => {
  if (wrappedKey.length <= ECIES_EPHEMERAL_LENGTH + ECIES_IV_LENGTH) {
    throw new Error('Wrapped key too short');
  }
  const ephemeralRaw = wrappedKey.slice(0, ECIES_EPHEMERAL_LENGTH);
  const iv = wrappedKey.slice(ECIES_EPHEMERAL_LENGTH, ECIES_EPHEMERAL_LENGTH + ECIES_IV_LENGTH);
  const payload = wrappedKey.slice(ECIES_EPHEMERAL_LENGTH + ECIES_IV_LENGTH);
  return { ephemeralRaw, iv, payload };
};
