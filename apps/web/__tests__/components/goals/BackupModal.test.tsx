import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BackupModal } from '../../../src/components/goals/BackupModal';
import { useApp } from '../../../src/providers/AppProvider';
import { makeAppContext } from '../../testUtils';

vi.mock('../../../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

describe('BackupModal', () => {
  it('shows error when passphrase is missing', async () => {
    mockedUseApp.mockReturnValue({
      ...makeAppContext({
        session: { status: 'ready', userId: 'user-1' },
        exportKeyVaultBackup: vi.fn(async () => ''),
      }),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /generate key backup/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter your passphrase to export the KeyVault.')).not.toBeNull();
    });
  });

  it('enables download after export', async () => {
    const exportKeyVaultBackup = vi.fn(async () => '{"cipher":"abc"}');
    mockedUseApp.mockReturnValue({
      ...makeAppContext({
        session: { status: 'ready', userId: 'user-1' },
        exportKeyVaultBackup,
      }),
    });

    render(<BackupModal open={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Enter your passphrase'), {
      target: { value: 'passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate key backup/i }));

    await waitFor(() => {
      const downloadButton = screen.getByRole('button', { name: /download backup/i });
      expect(downloadButton).toBeTruthy();
      if (!(downloadButton instanceof HTMLButtonElement)) {
        throw new Error('Expected download backup to be a button element');
      }
      expect(downloadButton.disabled).toBe(false);
    });

    expect(exportKeyVaultBackup).toHaveBeenCalledWith({ password: 'passphrase' });
    expect(screen.getByRole('button', { name: /backup db/i })).toBeTruthy();
  });
});
