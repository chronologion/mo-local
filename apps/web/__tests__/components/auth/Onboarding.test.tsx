import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Onboarding } from '../../../src/components/auth/Onboarding';
import { useApp } from '../../../src/providers/AppProvider';

vi.mock('../../../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

describe('Onboarding', () => {
  it('validates password length and mismatch', async () => {
    mockedUseApp.mockReturnValue({
      completeOnboarding: vi.fn(async () => {}),
      restoreBackup: vi.fn(async () => {}),
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useApp>);

    render(<Onboarding />);

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'short' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /finish onboarding/i })
    );
    expect(
      screen.getByText('Password must be at least 8 characters')
    ).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'mismatch' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /finish onboarding/i })
    );
    expect(screen.getByText('Passwords do not match')).not.toBeNull();
  });

  it('calls completeOnboarding with valid password', async () => {
    const completeOnboarding = vi.fn(async () => {});
    mockedUseApp.mockReturnValue({
      completeOnboarding,
      restoreBackup: vi.fn(async () => {}),
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useApp>);

    render(<Onboarding />);

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /finish onboarding/i })
    );

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith({
        password: 'longpassword',
      });
    });
  });

  it('validates restore inputs and calls restoreBackup', async () => {
    const restoreBackup = vi.fn(async () => {});
    mockedUseApp.mockReturnValue({
      completeOnboarding: vi.fn(async () => {}),
      restoreBackup,
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useApp>);

    render(<Onboarding />);
    fireEvent.click(
      screen.getByRole('button', { name: /restore backup/i })
    );
    expect(screen.getByText('Choose a backup file first')).not.toBeNull();

    const baseFile = new File(['backup'], 'keys.backup', {
      type: 'application/json',
    });
    const file: File & { text: () => Promise<string> } = Object.assign(
      baseFile,
      { text: async () => 'backup' }
    );
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (!input) return;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText('Passphrase used for backup'), {
      target: { value: 'secretpass' },
    });
    await waitFor(() => {
      expect(screen.getByText(/Selected:/)).not.toBeNull();
    });
    fireEvent.click(
      screen.getByRole('button', { name: /restore backup/i })
    );

    await waitFor(() => {
      expect(restoreBackup).toHaveBeenCalledWith({
        password: 'secretpass',
        backup: 'backup',
      });
    });
  });
});
