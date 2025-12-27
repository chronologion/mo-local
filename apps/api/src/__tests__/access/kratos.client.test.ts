import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KratosClient } from '../../access/infrastructure/kratos.client';

type FetchResponse = {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
};

const makeResponse = (payload: unknown, status = 200): FetchResponse => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () =>
    typeof payload === 'string' ? payload : JSON.stringify(payload),
});

const makeClient = (baseUrl?: string) =>
  new KratosClient(
    new ConfigService(baseUrl ? { KRATOS_PUBLIC_URL: baseUrl } : {})
  );

describe('KratosClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when KRATOS_PUBLIC_URL is missing', async () => {
    const client = makeClient();
    await expect(client.whoAmI('token')).rejects.toThrow(
      'KRATOS_PUBLIC_URL is required to validate sessions'
    );
  });

  it('rejects unauthorized responses', async () => {
    const client = makeClient('http://kratos.test');
    fetchMock.mockResolvedValue(makeResponse('', 401));
    await expect(client.whoAmI('token')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects non-ok responses', async () => {
    const client = makeClient('http://kratos.test');
    fetchMock.mockResolvedValue(makeResponse('nope', 500));
    await expect(client.whoAmI('token')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects invalid payloads', async () => {
    const client = makeClient('http://kratos.test');
    fetchMock.mockResolvedValue(makeResponse({}, 200));
    await expect(client.whoAmI('token')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('returns identity for valid payloads', async () => {
    const client = makeClient('http://kratos.test');
    fetchMock.mockResolvedValue(
      makeResponse(
        {
          identity: { id: 'identity-1', traits: { email: 'user@example.com' } },
        },
        200
      )
    );
    const result = await client.whoAmI('token');
    expect(result).toEqual({
      id: 'identity-1',
      traits: { email: 'user@example.com' },
    });
  });
});
