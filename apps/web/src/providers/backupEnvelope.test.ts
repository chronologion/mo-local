import { describe, expect, it } from 'vitest';

import { parseBackupEnvelope } from './backupEnvelope';

describe('parseBackupEnvelope', () => {
  it('strips prototype pollution keys before validation', () => {
    const maliciousBackup = JSON.stringify({
      cipher: 'dGVzdA==',
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
    });

    const envelope = parseBackupEnvelope(maliciousBackup);

    expect(envelope.cipher).toBe('dGVzdA==');
    expect(envelope.salt).toBeUndefined();
    const plain: Record<string, unknown> = {};
    expect(plain.polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('falls back to treating the string as a cipher when JSON parsing fails', () => {
    const envelope = parseBackupEnvelope('  dGVzdA==  ');

    expect(envelope).toEqual({ cipher: 'dGVzdA==', salt: undefined });
  });
});
