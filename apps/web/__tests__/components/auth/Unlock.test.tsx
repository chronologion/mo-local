import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Unlock } from '../../../src/components/auth/Unlock';
import { useApp } from '../../../src/providers/AppProvider';

vi.mock('../../../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

describe('Unlock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls unlock with password', async () => {
    const unlock = vi.fn(async () => {});
    mockedUseApp.mockReturnValue({
      session: { status: 'locked', userId: 'user-1' },
      unlock,
      resetLocalState: vi.fn(async () => {}),
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useApp>);

    render(<Unlock />);

    const input = document.querySelector(
      'input[type="password"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (!input) return;
    fireEvent.change(input, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(unlock).toHaveBeenCalledWith({ password: 'secret123' });
    });
  });

  it('resets local state when confirmed', async () => {
    const resetLocalState = vi.fn(async () => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedUseApp.mockReturnValue({
      session: { status: 'locked', userId: 'user-1' },
      unlock: vi.fn(async () => {}),
      resetLocalState,
      // Minimal context for component; other fields are unused in this test.
    } as ReturnType<typeof useApp>);

    render(<Unlock />);

    fireEvent.click(screen.getByRole('button', { name: /reset local data/i }));

    await waitFor(() => {
      expect(resetLocalState).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy).toHaveBeenCalled();
  });
});
