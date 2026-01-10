import { describe, expect, it } from 'vitest';

describe('vault bytes validation', () => {
  const decodeVaultBytes = (cipherB64: string): Uint8Array => {
    return Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
  };

  const validateVaultBytes = (vaultBytes: Uint8Array): void => {
    // Minimum size accounts for nonce (12) + auth tag (16) = 28 bytes minimum for AES-GCM
    if (vaultBytes.length < 28) {
      throw new Error('Invalid backup: vault data too short');
    }
    if (vaultBytes.length > 10 * 1024 * 1024) {
      throw new Error('Invalid backup: vault data exceeds maximum size');
    }
  };

  it('rejects vault data that is too short', () => {
    // Base64 encode 20 bytes (less than minimum 28)
    const shortData = btoa(String.fromCharCode(...new Array(20).fill(0)));
    const vaultBytes = decodeVaultBytes(shortData);

    expect(() => validateVaultBytes(vaultBytes)).toThrow('vault data too short');
  });

  it('rejects vault data that exceeds maximum size', () => {
    // Create a mock that simulates >10MB
    const oversizedBytes = new Uint8Array(11 * 1024 * 1024);

    expect(() => validateVaultBytes(oversizedBytes)).toThrow('exceeds maximum size');
  });

  it('accepts vault data within valid size range', () => {
    // Base64 encode 1KB of data (within valid range)
    const validData = btoa(String.fromCharCode(...new Array(1024).fill(0)));
    const vaultBytes = decodeVaultBytes(validData);

    expect(() => validateVaultBytes(vaultBytes)).not.toThrow();
  });

  it('accepts minimum valid size (28 bytes)', () => {
    const minData = btoa(String.fromCharCode(...new Array(28).fill(0)));
    const vaultBytes = decodeVaultBytes(minData);

    expect(() => validateVaultBytes(vaultBytes)).not.toThrow();
    expect(vaultBytes.length).toBe(28);
  });

  it('rejects invalid base64 encoding', () => {
    const invalidBase64 = 'not-valid-base64!!!';

    expect(() => decodeVaultBytes(invalidBase64)).toThrow();
  });
});
