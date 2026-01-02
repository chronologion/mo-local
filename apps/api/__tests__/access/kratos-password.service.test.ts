import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { KratosPasswordService } from '../../src/access/infrastructure/kratos-password.service';

type FetchCall = {
  url: string;
  init?: { method?: string };
};

const hasMethod = (value: unknown): value is { method?: string } =>
  typeof value === 'object' && value !== null && 'method' in value;

const makeService = () => new KratosPasswordService(new ConfigService({ KRATOS_PUBLIC_URL: 'http://kratos.test' }));

type FetchResponse = {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
};

const responseJson = (payload: unknown, status = 200): FetchResponse => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(payload),
});

describe('KratosPasswordService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers via password flow and returns session', async () => {
    const service = makeService();
    fetchMock
      .mockResolvedValueOnce(
        responseJson({
          id: 'flow-1',
          ui: {
            nodes: [{ attributes: { name: 'csrf_token', value: 'csrf' } }],
          },
        })
      )
      .mockResolvedValueOnce(
        responseJson({
          session_token: 'sess-1',
          session: {
            identity: { id: 'identity-1', traits: { email: 'a@b.com' } },
          },
        })
      );

    const session = await service.register('a@b.com', 'password123');
    expect(session).toEqual({
      sessionToken: 'sess-1',
      identityId: 'identity-1',
      email: 'a@b.com',
    });

    const calls: FetchCall[] = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      init: hasMethod(init) ? { method: init.method } : undefined,
    }));
    expect(calls[0]?.url).toContain('/self-service/registration/api');
    expect(calls[1]?.url).toContain('/self-service/registration');
  });

  it('throws when flow response is missing id', async () => {
    const service = makeService();
    fetchMock.mockResolvedValueOnce(responseJson({ ui: { nodes: [] } }));
    await expect(service.register('a@b.com', 'password123')).rejects.toThrow('Kratos flow response missing flow id');
  });

  it('throws when session token is missing', async () => {
    const service = makeService();
    fetchMock
      .mockResolvedValueOnce(responseJson({ id: 'flow-1', ui: { nodes: [] } }))
      .mockResolvedValueOnce(responseJson({ session: { identity: { id: 'id' } } }));
    await expect(service.login('a@b.com', 'password123')).rejects.toThrow('Login failed');
  });

  it('logs out via delete and accepts 204', async () => {
    const service = makeService();
    fetchMock.mockResolvedValueOnce(responseJson('', 204));
    await expect(service.logout('sess-1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/self-service/logout/api');
    const method = hasMethod(init) ? init.method : undefined;
    expect(method).toBe('DELETE');
  });
});
