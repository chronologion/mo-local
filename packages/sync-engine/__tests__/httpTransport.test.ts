import { describe, expect, it, vi } from 'vitest';
import { HttpSyncTransport } from '../src/httpTransport';

const makeResponse = (body: unknown, init?: ResponseInit): Response => {
  const payload =
    typeof body === 'string' ? body : JSON.stringify(body ?? null);
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
};

describe('HttpSyncTransport', () => {
  it('push posts JSON to /sync/push with credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        head: 2,
        assigned: [{ eventId: 'e1', globalSequence: 2 }],
      })
    );
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000/',
      fetchImpl,
      credentials: 'include',
    });

    await transport.push({
      storeId: 'store-1',
      expectedHead: 1,
      events: [{ eventId: 'e1', recordJson: '{"ok":true}' }],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/sync/push');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toBe(
      JSON.stringify({
        storeId: 'store-1',
        expectedHead: 1,
        events: [{ eventId: 'e1', recordJson: '{"ok":true}' }],
      })
    );
  });

  it('throws when push response is not JSON', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse('not-json', { status: 200 }));
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await expect(
      transport.push({
        storeId: 'store-1',
        expectedHead: 0,
        events: [],
      })
    ).rejects.toThrow('Invalid sync push response');
  });

  it('throws on push non-409 error status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ error: 'oops' }, { status: 500 }));
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await expect(
      transport.push({
        storeId: 'store-1',
        expectedHead: 0,
        events: [],
      })
    ).rejects.toThrow('Sync push failed with status 500');
  });

  it('throws on push unauthorized', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ error: 'nope' }, { status: 401 }));
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await expect(
      transport.push({
        storeId: 'store-1',
        expectedHead: 0,
        events: [],
      })
    ).rejects.toThrow('Sync push unauthorized (401)');
  });

  it('pulls from /sync/pull with waitMs when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        head: 3,
        events: [],
        hasMore: false,
        nextSince: null,
      })
    );
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await transport.pull({
      storeId: 'store-1',
      since: 2,
      limit: 50,
      waitMs: 10,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://localhost:4000/sync/pull?storeId=store-1&since=2&limit=50&waitMs=10'
    );
    expect(init.credentials).toBe('include');
  });

  it('throws on pull non-OK status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ error: 'nope' }, { status: 503 }));
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await expect(
      transport.pull({ storeId: 'store-1', since: 0, limit: 1 })
    ).rejects.toThrow('Sync pull failed with status 503');
  });

  it('ping throws when status is not ok', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        makeResponse({}, { status: 500, statusText: 'Server Error' })
      );
    const transport = new HttpSyncTransport({
      baseUrl: 'http://localhost:4000',
      fetchImpl,
    });

    await expect(transport.ping()).rejects.toThrow(
      'Sync ping failed with status 500'
    );
  });
});
