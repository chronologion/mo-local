import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Onboarding } from '../../../src/components/auth/Onboarding';
import { useApp } from '../../../src/providers/AppProvider';
import { makeAppContext } from '../../testUtils';

vi.mock('../../../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

describe('Onboarding', () => {
  it('validates password length and mismatch', async () => {
    mockedUseApp.mockReturnValue(
      makeAppContext({
        completeOnboarding: vi.fn(async () => {}),
        restoreBackup: vi.fn(async (_params) => {}),
        session: { status: 'needs-onboarding' },
      })
    );

    render(<Onboarding />);

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));
    expect(screen.getByText('Password must be at least 8 characters')).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'mismatch' },
    });
    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));
    expect(screen.getByText('Passwords do not match')).not.toBeNull();
  });

  it('calls completeOnboarding with valid password', async () => {
    const completeOnboarding = vi.fn(async () => {});
    mockedUseApp.mockReturnValue(
      makeAppContext({
        completeOnboarding,
        restoreBackup: vi.fn(async (_params) => {}),
        session: { status: 'needs-onboarding' },
      })
    );

    render(<Onboarding />);

    fireEvent.change(screen.getByPlaceholderText('Create a passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat passphrase'), {
      target: { value: 'longpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith({
        password: 'longpassword',
      });
    });
  });

  it('validates restore inputs and calls restoreBackup', async () => {
    const restoreBackup = vi.fn(async (_params) => {});
    mockedUseApp.mockReturnValue(
      makeAppContext({
        completeOnboarding: vi.fn(async () => {}),
        restoreBackup,
        session: { status: 'needs-onboarding' },
      })
    );

    render(<Onboarding />);
    fireEvent.click(screen.getByRole('button', { name: /restore backup/i }));
    expect(screen.getByText('Choose a backup file first')).not.toBeNull();

    const baseFile = new File(['backup'], 'keys.backup', {
      type: 'application/json',
    });
    const file: File & { text: () => Promise<string> } = Object.assign(baseFile, { text: async () => 'backup' });
    const input = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement | undefined;
    expect(input).not.toBeNull();
    if (!input) return;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText('Passphrase used for backup'), {
      target: { value: 'secretpass' },
    });
    await waitFor(() => {
      expect(screen.getByText(/Selected:/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: /restore backup/i }));

    await waitFor(() => {
      expect(restoreBackup).toHaveBeenCalledWith({
        password: 'secretpass',
        backup: 'backup',
      });
    });
  });

  it('passes db file bytes when selected', async () => {
    const restoreBackup = vi.fn(async (_params) => {});
    mockedUseApp.mockReturnValue(
      makeAppContext({
        completeOnboarding: vi.fn(async () => {}),
        restoreBackup,
        session: { status: 'needs-onboarding' },
      })
    );

    render(<Onboarding />);

    const baseFile = new File(['backup'], 'keys.backup', {
      type: 'application/json',
    });
    const file: File & { text: () => Promise<string> } = Object.assign(baseFile, { text: async () => 'backup' });

    const baseDbFile = new File([new Uint8Array([9, 8, 7])], 'mo-eventstore-019b0000-0000-7000-8000-000000000000.db', {
      type: 'application/x-sqlite3',
    });
    const dbFile: File & { arrayBuffer: () => Promise<ArrayBuffer> } = Object.assign(baseDbFile, {
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    });

    const inputs = document.querySelectorAll('input[type="file"]');
    const backupInput = inputs[0] as HTMLInputElement | undefined;
    const dbInput = inputs[1] as HTMLInputElement | undefined;
    expect(backupInput).toBeTruthy();
    expect(dbInput).toBeTruthy();
    if (!backupInput || !dbInput) return;

    fireEvent.change(backupInput, { target: { files: [file] } });
    fireEvent.change(dbInput, { target: { files: [dbFile] } });
    fireEvent.change(screen.getByPlaceholderText('Passphrase used for backup'), {
      target: { value: 'secretpass' },
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /restore backup/i });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /restore backup/i }));

    await waitFor(() => {
      expect(restoreBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'secretpass',
          backup: 'backup',
          db: expect.objectContaining({
            bytes: expect.any(Uint8Array),
          }),
        })
      );
    });
  });
});
