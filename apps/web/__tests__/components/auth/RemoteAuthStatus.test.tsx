import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoteAuthStatus } from '../../../src/components/auth/RemoteAuthStatus';
import { useRemoteAuth } from '../../../src/providers/RemoteAuthProvider';
import { makeRemoteAuthContext } from '../../testUtils';

const modalSpy = vi.fn();

vi.mock('../../../src/providers/RemoteAuthProvider', () => ({
  useRemoteAuth: vi.fn(),
}));

vi.mock('../../../src/components/auth/RemoteAuthModal', () => ({
  RemoteAuthModal: ({ open, mode }: { open: boolean; mode: 'login' | 'signup' }) => {
    modalSpy(open, mode);
    return <div>RemoteAuthModal Stub</div>;
  },
}));

const mockedUseRemoteAuth = vi.mocked(useRemoteAuth);

describe('RemoteAuthStatus', () => {
  it('shows connect button when disconnected', () => {
    mockedUseRemoteAuth.mockReturnValue({
      ...makeRemoteAuthContext(),
    });

    render(<RemoteAuthStatus />);
    fireEvent.click(screen.getByRole('button', { name: /connect to cloud/i }));
    expect(modalSpy).toHaveBeenCalled();
  });

  it('shows connected state and logs out', async () => {
    const logOut = vi.fn(async () => {});
    mockedUseRemoteAuth.mockReturnValue(
      makeRemoteAuthContext({
        state: { status: 'connected', identityId: 'id-1', email: 'a@b.com' },
        logOut,
      })
    );

    render(<RemoteAuthStatus />);
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(logOut).toHaveBeenCalledTimes(1);
    });
  });
});
