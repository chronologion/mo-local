import React from 'react';
import { describe, beforeEach, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  RemoteAuthProvider,
  useRemoteAuth,
} from '../../src/providers/RemoteAuthProvider';
import type { ICloudAccessClient } from '@mo/application';

const createClient = (
  overrides: Partial<ICloudAccessClient> = {}
): ICloudAccessClient => ({
  whoAmI: vi.fn(async () => null),
  register: vi.fn(async () => ({ identityId: 'id-1', email: 'a@b.com' })),
  login: vi.fn(async () => ({ identityId: 'id-1', email: 'a@b.com' })),
  logout: vi.fn(async () => ({ revoked: true })),
  ...overrides,
});

const createWrapper =
  (client: ICloudAccessClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <RemoteAuthProvider client={client}>{children}</RemoteAuthProvider>
  );

describe('RemoteAuthProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disconnected when whoami returns null', async () => {
    const client = createClient();
    const { result } = renderHook(() => useRemoteAuth(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('disconnected');
    });
  });

  it('connects when whoami succeeds', async () => {
    const client = createClient({
      whoAmI: vi.fn(async () => ({
        identityId: 'user-1',
        email: 'user@example.com',
      })),
    });
    const { result } = renderHook(() => useRemoteAuth(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('connected');
    });
    expect(result.current.state.status === 'connected').toBe(true);
    if (result.current.state.status === 'connected') {
      expect(result.current.state.identityId).toBe('user-1');
      expect(result.current.state.email).toBe('user@example.com');
    }
  });

  it('sets an error when whoami throws', async () => {
    const client = createClient({
      whoAmI: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { result } = renderHook(() => useRemoteAuth(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('disconnected');
      expect(result.current.error).toBeTruthy();
    });
  });

  it('signs up and connects', async () => {
    const client = createClient({
      register: vi.fn(async () => ({
        identityId: 'id-123',
        email: 'new@example.com',
      })),
    });
    const { result } = renderHook(() => useRemoteAuth(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      await result.current.signUp({
        email: 'new@example.com',
        password: 'secret123',
      });
    });
    expect(client.register).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret123',
    });
    expect(result.current.state.status).toBe('connected');
    if (result.current.state.status === 'connected') {
      expect(result.current.state.identityId).toBe('id-123');
    }
  });

  it('logs out and clears session', async () => {
    const client = createClient({
      register: vi.fn(async () => ({
        identityId: 'id-logout',
        email: 'bye@example.com',
      })),
      logout: vi.fn(async () => ({ revoked: true })),
    });
    const { result } = renderHook(() => useRemoteAuth(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      await result.current.signUp({
        email: 'bye@example.com',
        password: 'secret123',
      });
    });
    await act(async () => {
      await result.current.logOut();
    });
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('disconnected');
  });
});
