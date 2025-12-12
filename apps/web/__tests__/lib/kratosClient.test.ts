import { describe, expect, it, vi } from 'vitest';
import { KratosClient } from '@mo/infrastructure/kratos/client';

type MockResponse = { status: number; body?: unknown; headers?: HeadersInit };

const createFetch = (queue: MockResponse[]) =>
  vi.fn().mockImplementation(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error('No mock responses left');
    }
    const jsonBody =
      next.body === undefined ? undefined : JSON.stringify(next.body);
    return new Response(jsonBody, {
      status: next.status,
      headers: next.headers,
    });
  });

describe('KratosClient', () => {
  it('registers via password flow and returns session info', async () => {
    const fetcher = createFetch([
      { status: 200, body: { id: 'flow-registration' } },
      {
        status: 200,
        body: {
          session_token: 'reg-token',
          session: {
            identity: { id: 'user-1', traits: { email: 'a@example.com' } },
          },
        },
      },
    ]);
    const client = new KratosClient({
      baseUrl: 'http://kratos:4455',
      fetcher,
    });
    const session = await client.registerWithPassword({
      email: 'a@example.com',
      password: 'secret',
    });
    expect(session).toEqual({
      sessionToken: 'reg-token',
      identityId: 'user-1',
      email: 'a@example.com',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('logs in via password flow and returns session info', async () => {
    const fetcher = createFetch([
      { status: 200, body: { id: 'flow-login' } },
      {
        status: 200,
        body: {
          session_token: 'login-token',
          session: {
            identity: { id: 'user-2', traits: { email: 'b@example.com' } },
          },
        },
      },
    ]);
    const client = new KratosClient({
      baseUrl: 'http://kratos:4455',
      fetcher,
    });
    const session = await client.loginWithPassword({
      identifier: 'b@example.com',
      password: 'secret',
    });
    expect(session.identityId).toBe('user-2');
    expect(session.sessionToken).toBe('login-token');
  });

  it('parses whoami responses and surfaces identity', async () => {
    const fetcher = createFetch([
      {
        status: 200,
        body: {
          identity: { id: 'user-3', traits: { email: 'c@example.com' } },
        },
      },
    ]);
    const client = new KratosClient({
      baseUrl: 'http://kratos:4455',
      fetcher,
    });
    const identity = await client.whoAmI('token');
    expect(identity).toEqual({
      identityId: 'user-3',
      email: 'c@example.com',
    });
  });

  it('throws on invalid sessions', async () => {
    const fetcher = createFetch([
      {
        status: 401,
        body: { error: { message: 'invalid session' } },
      },
    ]);
    const client = new KratosClient({
      baseUrl: 'http://kratos:4455',
      fetcher,
    });
    await expect(client.whoAmI('bad-token')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('accepts logout 204 response', async () => {
    const fetcher = createFetch([{ status: 204 }]);
    const client = new KratosClient({
      baseUrl: 'http://kratos:4455',
      fetcher,
    });
    await expect(client.logout('some-token')).resolves.toBeUndefined();
  });
});
