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

    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter your passphrase to export the KeyVault.')).not.toBeNull();
    });
  });

  it('generates and downloads backup in single click', async () => {
    const exportKeyVaultBackup = vi.fn(async () => '{"cipher":"abc"}');
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickSpy;
      }
      return element;
    });

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
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));

    await waitFor(() => {
      expect(exportKeyVaultBackup).toHaveBeenCalledWith({ password: 'passphrase' });
      expect(clickSpy).toHaveBeenCalled();
    });

    vi.restoreAllMocks();
  });
});
