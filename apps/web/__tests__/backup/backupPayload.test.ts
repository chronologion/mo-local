import { describe, expect, it } from 'vitest';

import { createBackupPayloadV2, parseBackupPayload } from '../../src/backup/backupPayload';

describe('backup payload', () => {
  it('omits aggregateKeys in v2 payloads', () => {
    const payload = createBackupPayloadV2({
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      identityKeys: {
        signingPrivateKey: 'a',
        signingPublicKey: 'b',
        encryptionPrivateKey: 'c',
        encryptionPublicKey: 'd',
      },
      exportedAt: new Date(0).toISOString(),
    });

    expect(payload.version).toBe(2);
    expect('aggregateKeys' in payload).toBe(false);
  });

  it('parses v2 payloads without aggregateKeys', () => {
    const parsed = parseBackupPayload({
      version: 2,
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      identityKeys: {
        signingPrivateKey: 'a',
        signingPublicKey: 'b',
        encryptionPrivateKey: 'c',
        encryptionPublicKey: 'd',
      },
      exportedAt: new Date(0).toISOString(),
    });

    expect(parsed.aggregateKeys).toEqual({});
  });

  it('parses legacy payloads with aggregateKeys', () => {
    const parsed = parseBackupPayload({
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      identityKeys: {
        signingPrivateKey: 'a',
        signingPublicKey: 'b',
        encryptionPrivateKey: 'c',
        encryptionPublicKey: 'd',
      },
      aggregateKeys: { 'goal-1': 'k1', 'goal-2': 'k2' },
      exportedAt: new Date(0).toISOString(),
    });

    expect(parsed.aggregateKeys).toEqual({ 'goal-1': 'k1', 'goal-2': 'k2' });
  });

  it('defaults exportedAt when missing', () => {
    const parsed = parseBackupPayload({
      userId: 'b5a60a7c-78d2-4310-90da-64d1c1f2f4a4',
      identityKeys: {
        signingPrivateKey: 'a',
        signingPublicKey: 'b',
        encryptionPrivateKey: 'c',
        encryptionPublicKey: 'd',
      },
    });

    expect(parsed.exportedAt).toBe('');
  });
});
