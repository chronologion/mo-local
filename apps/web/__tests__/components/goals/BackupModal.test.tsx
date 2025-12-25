import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BackupModal } from '../../../src/components/goals/BackupModal';
import { useApp } from '../../../src/providers/AppProvider';

vi.mock('@mo/infrastructure/crypto/deriveSalt', () => ({
  deriveLegacySaltForUser: vi.fn(async () => new Uint8Array([1, 2, 3])),
  encodeSalt: vi.fn(() => 'salt-b64'),
}));

vi.mock('../../../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

const baseServices = {
  keyStore: {
    exportKeys: vi.fn(async () => ({
      userId: 'user-1',
      identityKeys: {
        signingPrivateKey: new Uint8Array([1]),
        signingPublicKey: new Uint8Array([2]),
        encryptionPrivateKey: new Uint8Array([3]),
        encryptionPublicKey: new Uint8Array([4]),
      },
      aggregateKeys: {},
    })),
  },
  crypto: {
    encrypt: vi.fn(async () => new Uint8Array([9, 9, 9])),
  },
};

describe('BackupModal', () => {
  it('shows error when master key is missing', async () => {
    mockedUseApp.mockReturnValue({
      session: { status: 'ready', userId: 'user-1' },
      // Test double: only keyStore/crypto are needed for this component.
      services: baseServices as ReturnType<typeof useApp>['services'],
      masterKey: null,
      userMeta: null,
      completeOnboarding: vi.fn(async () => {}),
      unlock: vi.fn(async () => {}),
      resetLocalState: vi.fn(async () => {}),
      rebuildProjections: vi.fn(async () => {}),
      restoreBackup: vi.fn(async () => {}),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Unlock with your passphrase to back up keys.')
      ).not.toBeNull();
    });
  });

  it('shows error when no keys exist', async () => {
    const services = {
      ...baseServices,
      keyStore: {
        exportKeys: vi.fn(async () => ({
          userId: 'user-1',
          identityKeys: null,
          aggregateKeys: {},
        })),
      },
    };
    mockedUseApp.mockReturnValue({
      session: { status: 'ready', userId: 'user-1' },
      // Test double: only keyStore/crypto are needed for this component.
      services: services as ReturnType<typeof useApp>['services'],
      masterKey: new Uint8Array([1, 2, 3]),
      userMeta: null,
      completeOnboarding: vi.fn(async () => {}),
      unlock: vi.fn(async () => {}),
      resetLocalState: vi.fn(async () => {}),
      rebuildProjections: vi.fn(async () => {}),
      restoreBackup: vi.fn(async () => {}),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No keys found in keystore')).not.toBeNull();
    });
  });

  it('shows success message when backup is ready', async () => {
    mockedUseApp.mockReturnValue({
      session: { status: 'ready', userId: 'user-1' },
      // Test double: only keyStore/crypto are needed for this component.
      services: baseServices as ReturnType<typeof useApp>['services'],
      masterKey: new Uint8Array([1, 2, 3]),
      userMeta: { userId: 'user-1', pwdSalt: 'salt-b64' },
      completeOnboarding: vi.fn(async () => {}),
      unlock: vi.fn(async () => {}),
      resetLocalState: vi.fn(async () => {}),
      rebuildProjections: vi.fn(async () => {}),
      restoreBackup: vi.fn(async () => {}),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Encrypted backup ready. Use Download or Copy to save it securely.'
        )
      ).not.toBeNull();
    });
  });
});
