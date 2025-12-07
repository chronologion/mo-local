import { describe, expect, it } from 'vitest';

import {
  decodeSalt,
  encodeSalt,
  generateRandomSalt,
} from '../../src/lib/deriveSalt';

describe('deriveSalt utilities', () => {
  it('encodes and decodes valid salts within bounds', () => {
    const salt = generateRandomSalt(32);
    const encoded = encodeSalt(salt);
    const decoded = decodeSalt(encoded);

    expect(decoded.length).toBe(32);
    expect(Array.from(decoded)).toEqual(Array.from(salt));
  });

  it('rejects salts shorter than 16 bytes', () => {
    const short = new Uint8Array([0]);
    const encoded = encodeSalt(short);

    expect(() => decodeSalt(encoded)).toThrow(
      /minimum 16 bytes required per NIST SP 800-132/
    );
  });

  it('rejects salts longer than 64 bytes', () => {
    const long = generateRandomSalt(65);
    const encoded = encodeSalt(long);

    expect(() => decodeSalt(encoded)).toThrow(/maximum 64 bytes exceeded/);
  });
});
