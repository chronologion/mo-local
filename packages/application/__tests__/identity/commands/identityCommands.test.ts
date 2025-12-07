import { describe, expect, it } from 'vitest';
import { validateRegisterUserCommand } from '../../../src/identity/commands/RegisterUserCommand';
import { validateImportUserKeysCommand } from '../../../src/identity/commands/ImportUserKeysCommand';
import { KeyBackup } from '../../../src/ports/types';

const now = Date.now();

describe('RegisterUserCommand validation', () => {
  it('ensures public keys are present', () => {
    const result = validateRegisterUserCommand({
      type: 'RegisterUser',
      userId: 'user-1',
      signingPublicKey: new Uint8Array(),
      encryptionPublicKey: new Uint8Array([1, 2]),
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'signingPublicKey')).toBe(
        true
      );
    }
  });
});

describe('ImportUserKeysCommand validation', () => {
  it('validates backup contents', () => {
    const backup: KeyBackup = {
      userId: 'user-1',
      identityKeys: {
        signingPrivateKey: new Uint8Array(),
        signingPublicKey: new Uint8Array([1]),
        encryptionPrivateKey: new Uint8Array([1]),
        encryptionPublicKey: new Uint8Array([1]),
      },
      aggregateKeys: {
        goal: new Uint8Array(),
      },
    };

    const result = validateImportUserKeysCommand({
      type: 'ImportUserKeys',
      userId: 'user-1',
      backup,
      timestamp: now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('backup.signingPrivateKey');
      expect(fields).toContain('backup.aggregateKeys.goal');
    }
  });
});
