import type {
  SyncPullResponseV1,
  SyncPushConflictResponseV1,
  SyncPushOkResponseV1,
  SyncPushRequestV1,
  SyncTransportPort,
} from './types';

export type HttpSyncTransportOptions = Readonly<{
  baseUrl: string;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
}>;

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export class HttpSyncTransport implements SyncTransportPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly credentials: RequestCredentials;

  constructor(options: HttpSyncTransportOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.credentials = options.credentials ?? 'include';
  }

  async push(
    request: SyncPushRequestV1
  ): Promise<SyncPushOkResponseV1 | SyncPushConflictResponseV1> {
    const response = await this.fetchImpl(`${this.baseUrl}/sync/push`, {
      method: 'POST',
      credentials: this.credentials,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = await safeParseJson(response);
    if (!isObject(body)) {
      throw new Error('Invalid sync push response');
    }
    return body as SyncPushOkResponseV1 | SyncPushConflictResponseV1;
  }

  async pull(params: {
    storeId: string;
    since: number;
    limit: number;
    waitMs?: number;
  }): Promise<SyncPullResponseV1> {
    const query = new URLSearchParams({
      storeId: params.storeId,
      since: String(params.since),
      limit: String(params.limit),
    });
    if (typeof params.waitMs === 'number') {
      query.set('waitMs', String(params.waitMs));
    }
    const response = await this.fetchImpl(
      `${this.baseUrl}/sync/pull?${query.toString()}`,
      { credentials: this.credentials }
    );
    const body = await safeParseJson(response);
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
}
