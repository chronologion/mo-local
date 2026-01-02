import { describe, expect, it } from 'vitest';

import { createBackupPayloadV2, parseBackupPayload } from '../../src/backup/backupPayload';

describe('backup payload', () => {
  it('omits aggregateKeys in v2 payloads', () => {
    const payload = createBackupPayloadV2({
      userId: '019b0000-0000-7000-8000-000000000000',
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
      userId: '019b0000-0000-7000-8000-000000000000',
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
      userId: '019b0000-0000-7000-8000-000000000000',
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
      userId: '019b0000-0000-7000-8000-000000000000',
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
