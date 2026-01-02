import type {
  SyncPullResponseV1,
  SyncDirection,
  SyncPushConflictResponseV1,
  SyncPushOkResponseV1,
  SyncPushRequestV1,
  SyncAbortableTransportPort,
} from './types';

export type HttpSyncTransportOptions = Readonly<{
  baseUrl: string;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
}>;

const normalizeBaseUrl = (baseUrl: string): string => (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl);

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export class HttpSyncTransport implements SyncAbortableTransportPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly credentials: RequestCredentials;
  private pullSignal: AbortSignal | null = null;
  private pushSignal: AbortSignal | null = null;

  constructor(options: HttpSyncTransportOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    const rawFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.fetchImpl = (input, init) => {
      const requestCtor = globalThis.Request;
      const url =
        typeof input === 'string'
          ? input
          : typeof requestCtor === 'function' && input instanceof requestCtor
            ? input.url
            : String(input);
      const method =
        init?.method ?? (typeof requestCtor === 'function' && input instanceof requestCtor ? input.method : undefined);

      const isPull = url.includes('/sync/pull');
      const isPush = url.includes('/sync/push');
      const signal =
        isPull && (method === undefined || method === 'GET')
          ? this.pullSignal
          : isPush && method === 'POST'
            ? this.pushSignal
            : null;

      const nextInit: RequestInit | undefined = signal === null ? init : { ...(init ?? {}), signal };

      return rawFetch(input, nextInit);
    };
    this.credentials = options.credentials ?? 'include';
  }

  async push(request: SyncPushRequestV1): Promise<SyncPushOkResponseV1 | SyncPushConflictResponseV1> {
    const response = await this.fetchImpl(`${this.baseUrl}/sync/push`, {
      method: 'POST',
      credentials: this.credentials,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Sync push unauthorized (${response.status})`);
    }
    const body = await safeParseJson(response);
    if (response.status === 409) {
      if (!isObject(body)) {
        throw new Error('Invalid sync push conflict response');
      }
      return body as SyncPushConflictResponseV1;
    }
    if (!response.ok) {
      throw new Error(`Sync push failed with status ${response.status}`);
    }
    if (!isObject(body)) {
      throw new Error('Invalid sync push response');
    }
    return body as SyncPushOkResponseV1 | SyncPushConflictResponseV1;
  }

  async pull(params: { storeId: string; since: number; limit: number; waitMs?: number }): Promise<SyncPullResponseV1> {
    const query = new URLSearchParams({
      storeId: params.storeId,
      since: String(params.since),
      limit: String(params.limit),
    });
    if (typeof params.waitMs === 'number') {
      query.set('waitMs', String(params.waitMs));
    }
    const response = await this.fetchImpl(`${this.baseUrl}/sync/pull?${query.toString()}`, {
      credentials: this.credentials,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Sync pull unauthorized (${response.status})`);
    }
    const body = await safeParseJson(response);
    if (!response.ok) {
      throw new Error(`Sync pull failed with status ${response.status}`);
    }
    if (!isObject(body)) {
      throw new Error('Invalid sync pull response');
    }
    return body as SyncPullResponseV1;
  }

  async ping(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`, {
      credentials: this.credentials,
    });
    if (!response.ok) {
      throw new Error(`Sync ping failed with status ${response.status}`);
    }
  }

  setAbortSignal(direction: SyncDirection, signal: AbortSignal | null): void {
    if (direction === 'pull') {
      this.pullSignal = signal;
      return;
    }
    this.pushSignal = signal;
  }
}
