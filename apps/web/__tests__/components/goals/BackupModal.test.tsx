import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BackupModal } from '../../../src/components/goals/BackupModal';
import { useApp } from '../../../src/providers/AppProvider';
import { makeAppContext, makeServices } from '../../testUtils';
import type { AppServices } from '../../../src/bootstrap/createAppServices';

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
      ...makeAppContext({
        session: { status: 'ready', userId: 'user-1' },
        services: makeServices({
          // Test double: only keyStore/crypto are needed for this component.
          keyStore: baseServices.keyStore as unknown as AppServices['keyStore'],
          crypto: baseServices.crypto as unknown as AppServices['crypto'],
        }),
        masterKey: null,
        userMeta: null,
      }),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Unlock with your passphrase to back up keys.')
      ).not.toBeNull();
    });
  });

  it('shows error when no keys exist', async () => {
    const services = makeServices({
      keyStore: {
        exportKeys: vi.fn(async () => ({
          userId: 'user-1',
          identityKeys: null,
          aggregateKeys: {},
        })),
      } as unknown as AppServices['keyStore'],
      crypto: baseServices.crypto as unknown as AppServices['crypto'],
    });
    mockedUseApp.mockReturnValue({
      ...makeAppContext({
        session: { status: 'ready', userId: 'user-1' },
        services,
        masterKey: new Uint8Array([1, 2, 3]),
        userMeta: null,
      }),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No keys found in keystore')).not.toBeNull();
    });
  });

  it('shows success message when backup is ready', async () => {
    mockedUseApp.mockReturnValue({
      ...makeAppContext({
        session: { status: 'ready', userId: 'user-1' },
        services: makeServices({
          keyStore: baseServices.keyStore as unknown as AppServices['keyStore'],
          crypto: baseServices.crypto as unknown as AppServices['crypto'],
        }),
        masterKey: new Uint8Array([1, 2, 3]),
        userMeta: { userId: 'user-1', pwdSalt: 'salt-b64' },
      }),
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
