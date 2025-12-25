import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoteAuthModal } from '../../../src/components/auth/RemoteAuthModal';
import { useRemoteAuth } from '../../../src/providers/RemoteAuthProvider';

vi.mock('../../../src/providers/RemoteAuthProvider', () => ({
  useRemoteAuth: vi.fn(),
}));

const mockedUseRemoteAuth = vi.mocked(useRemoteAuth);

describe('RemoteAuthModal', () => {
  it('submits signup with email and password', async () => {
    const signUp = vi.fn(async () => {});
    mockedUseRemoteAuth.mockReturnValue({
      signUp,
      logIn: vi.fn(async () => {}),
      state: { status: 'disconnected' },
      logOut: vi.fn(async () => {}),
      clearError: vi.fn(),
      error: null,
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useRemoteAuth>);

    render(<RemoteAuthModal open={true} onClose={vi.fn()} mode="signup" />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter a strong password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret123',
      });
    });
  });

  it('shows error on failed login', async () => {
    const logIn = vi.fn(async () => {
      throw new Error('boom');
    });
    mockedUseRemoteAuth.mockReturnValue({
      signUp: vi.fn(async () => {}),
      logIn,
      state: { status: 'disconnected' },
      logOut: vi.fn(async () => {}),
      clearError: vi.fn(),
      error: null,
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useRemoteAuth>);

    render(<RemoteAuthModal open={true} onClose={vi.fn()} mode="login" />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/an error occurred/i)).not.toBeNull();
    });
  });

  it('closes when connected', async () => {
    const onClose = vi.fn();
    mockedUseRemoteAuth.mockReturnValue({
      signUp: vi.fn(async () => {}),
      logIn: vi.fn(async () => {}),
      state: { status: 'connected', identityId: 'id-1', email: 'a@b.com' },
      logOut: vi.fn(async () => {}),
      clearError: vi.fn(),
      error: null,
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useRemoteAuth>);

    render(<RemoteAuthModal open={true} onClose={onClose} mode="signup" />);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
