import { describe, expect, it } from 'vitest';
import { createKeyVaultEnvelope, parseKeyVaultEnvelope } from '../../src/backup/keyVaultEnvelope';

describe('keyVaultEnvelope', () => {
  it('creates a valid envelope', () => {
    const envelope = createKeyVaultEnvelope({
      cipher: 'base64-encoded-data',
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      exportedAt: new Date(0).toISOString(),
      version: 1,
    });

    expect(envelope.cipher).toBe('base64-encoded-data');
    expect(envelope.userId).toBe('b5a60a7c-78d2-4310-90da-64d1c1f2f4a4');
    expect(envelope.version).toBe(1);
  });

  it('parses a valid JSON envelope', () => {
    const backup = JSON.stringify({
      cipher: 'base64-encoded-data',
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      exportedAt: new Date(0).toISOString(),
      version: 1,
    });

    const parsed = parseKeyVaultEnvelope(backup);
    expect(parsed.cipher).toBe('base64-encoded-data');
    expect(parsed.userId).toBe('b5a60a7c-78d2-4310-90da-64d1c1f2f4a4');
  });

  it('parses plain cipher text (fallback for legacy)', () => {
    const backup = 'base64-encoded-data-only';
    const parsed = parseKeyVaultEnvelope(backup);
    expect(parsed.cipher).toBe('base64-encoded-data-only');
  });

  it('rejects envelope with empty cipher', () => {
    const backup = JSON.stringify({
      cipher: '',
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
    });

    expect(() => parseKeyVaultEnvelope(backup)).toThrow();
  });

  it('rejects envelope with invalid userId format', () => {
    const backup = JSON.stringify({
      cipher: 'base64-encoded-data',
      userId: 'not-a-uuid',
    });

    expect(() => parseKeyVaultEnvelope(backup)).toThrow();
  });

  it('sanitizes prototype pollution attempts', () => {
    const malicious = JSON.stringify({
      cipher: 'base64-encoded-data',
      __proto__: { polluted: true },
      constructor: { polluted: true },
      prototype: { polluted: true },
    });

    const parsed = parseKeyVaultEnvelope(malicious);
    expect(parsed.cipher).toBe('base64-encoded-data');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'prototype')).toBe(false);
  });

  it('handles nested prototype pollution attempts', () => {
    const malicious = JSON.stringify({
      cipher: 'base64-encoded-data',
      nested: {
        __proto__: { polluted: true },
      },
    });

    const parsed = parseKeyVaultEnvelope(malicious);
    expect(parsed.cipher).toBe('base64-encoded-data');
  });
});
