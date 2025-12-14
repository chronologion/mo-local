import React from 'react';
import { describe, beforeEach, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  RemoteAuthProvider,
  useRemoteAuth,
} from '../../src/providers/RemoteAuthProvider';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RemoteAuthProvider>{children}</RemoteAuthProvider>
);

const createResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const createLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('RemoteAuthProvider', () => {
  const fetchMock = vi.spyOn(global, 'fetch');
  const localStorageStub = createLocalStorage();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('localStorage', localStorageStub);
    localStorageStub.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disconnected without stored token', async () => {
    fetchMock.mockResolvedValue(createResponse({}));
    const { result } = renderHook(() => useRemoteAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.state.status).toBe('disconnected');
    });
  });

  it('restores a stored session token when whoami succeeds', async () => {
    localStorage.setItem('mo-remote-session-token', 'token-123');
    fetchMock.mockResolvedValue(
      createResponse({ identityId: 'user-1', email: 'user@example.com' })
    );
    const { result } = renderHook(() => useRemoteAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.state.status).toBe('connected');
    });
    expect(result.current.state.status === 'connected').toBe(true);
    if (result.current.state.status === 'connected') {
      expect(result.current.state.identityId).toBe('user-1');
      expect(result.current.state.email).toBe('user@example.com');
    }
  });

  it('clears invalid stored token when whoami fails', async () => {
    localStorage.setItem('mo-remote-session-token', 'token-123');
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { result } = renderHook(() => useRemoteAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.state.status).toBe('disconnected');
      expect(result.current.error).toBeTruthy();
    });
    expect(localStorage.getItem('mo-remote-session-token')).toBeNull();
  });

  it('signs up and connects', async () => {
    fetchMock.mockResolvedValue(
      createResponse({
        identityId: 'id-123',
        email: 'new@example.com',
      })
    );
    const { result } = renderHook(() => useRemoteAuth(), { wrapper });
    await act(async () => {
      await result.current.signUp({
        email: 'new@example.com',
        password: 'secret123',
      });
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.state.status).toBe('connected');
    if (result.current.state.status === 'connected') {
      expect(result.current.state.identityId).toBe('id-123');
    }
  });

  it('logs out and clears session', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          identityId: 'id-logout',
          email: 'bye@example.com',
        })
      )
      .mockResolvedValueOnce(createResponse({ revoked: true }));
    const { result } = renderHook(() => useRemoteAuth(), { wrapper });
    await act(async () => {
      await result.current.signUp({
        email: 'bye@example.com',
        password: 'secret123',
      });
    });
    await act(async () => {
      await result.current.logOut();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('disconnected');
  });
});
