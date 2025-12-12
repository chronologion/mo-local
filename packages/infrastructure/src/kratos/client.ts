type SimpleResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (
  input: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: 'manual' | 'follow';
  }
) => Promise<SimpleResponse>;

type KratosIdentityTraits = {
  email?: string;
  [key: string]: unknown;
};

type KratosIdentity = {
  id: string;
  traits: KratosIdentityTraits;
};

type KratosWhoAmIPayload = {
  identity: KratosIdentity;
};

export type KratosSession = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

export type KratosPasswordRegistration = {
  email: string;
  password: string;
};

export type KratosPasswordLogin = {
  identifier: string;
  password: string;
};

export class KratosClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = 'KratosClientError';
  }
}

export class KratosClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(params: { baseUrl: string; fetcher?: FetchLike }) {
    if (!params.baseUrl) {
      throw new Error('Kratos baseUrl is required');
    }
    this.baseUrl = params.baseUrl.replace(/\/+$/, '');
    const fetchImpl =
      params.fetcher ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new Error('Fetch implementation is required for KratosClient');
    }
    this.fetcher = (input, init) => fetchImpl(input, init);
  }

  async registerWithPassword(
    credentials: KratosPasswordRegistration
  ): Promise<KratosSession> {
    const flowId = await this.createFlow('/self-service/registration/api');
    return this.submitRegistration(flowId, credentials);
  }

  async loginWithPassword(
    credentials: KratosPasswordLogin
  ): Promise<KratosSession> {
    const flowId = await this.createFlow('/self-service/login/api');
    return this.submitLogin(flowId, credentials);
  }

  async whoAmI(sessionToken: string): Promise<{
    identityId: string;
    email?: string;
  }> {
    const response = await this.fetcher(this.composeUrl('/sessions/whoami'), {
      headers: {
        accept: 'application/json',
        'x-session-token': sessionToken,
      },
      redirect: 'manual',
    });
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw this.toError('Session is invalid or expired', response, payload);
    }
    const parsed = this.parseWhoAmI(payload);
    return {
      identityId: parsed.identity.id,
      email: parsed.identity.traits.email,
    };
  }

  async logout(sessionToken: string): Promise<void> {
    const response = await this.fetcher(
      this.composeUrl('/self-service/logout/api'),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ session_token: sessionToken }),
      }
    );
    if (response.status === 204) {
      return;
    }
    if (!response.ok) {
      const payload = await this.readJson(response);
      throw this.toError('Failed to revoke session', response, payload);
    }
  }

  private async createFlow(path: string): Promise<string> {
    const response = await this.fetcher(this.composeUrl(path), {
      headers: { accept: 'application/json' },
      redirect: 'manual',
    });
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw this.toError('Failed to initialize Kratos flow', response, payload);
    }
    const flowId = this.parseFlowId(payload);
    return flowId;
  }

  private async submitRegistration(
    flowId: string,
    credentials: KratosPasswordRegistration
  ): Promise<KratosSession> {
    const response = await this.fetcher(
      this.composeUrl('/self-service/registration', flowId),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          method: 'password',
          traits: { email: credentials.email },
          password: credentials.password,
        }),
      }
    );
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw this.toError('Registration failed', response, payload);
    }
    return this.parseSession(payload);
  }

  private async submitLogin(
    flowId: string,
    credentials: KratosPasswordLogin
  ): Promise<KratosSession> {
    const response = await this.fetcher(
      this.composeUrl('/self-service/login', flowId),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          method: 'password',
          identifier: credentials.identifier,
          password: credentials.password,
        }),
      }
    );
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw this.toError('Login failed', response, payload);
    }
    return this.parseSession(payload);
  }

  private parseFlowId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid flow response from Kratos');
    }
    const id = (payload as { id?: unknown }).id;
    if (typeof id !== 'string' || !id) {
      throw new Error('Kratos flow response missing id');
    }
    return id;
  }

  private parseWhoAmI(payload: unknown): KratosWhoAmIPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid whoami response from Kratos');
    }
    const identity = (payload as { identity?: unknown }).identity;
    if (!identity || typeof identity !== 'object') {
      throw new Error('Kratos whoami response missing identity');
    }
    const identityId = (identity as { id?: unknown }).id;
    if (typeof identityId !== 'string') {
      throw new Error('Kratos identity id is missing');
    }
    const traits = (identity as { traits?: unknown }).traits;
    const email =
      traits && typeof traits === 'object'
        ? (traits as KratosIdentityTraits).email
        : undefined;
    return {
      identity: {
        id: identityId,
        traits: {
          ...(traits && typeof traits === 'object' ? traits : {}),
          email,
        },
      },
    };
  }

  private parseSession(payload: unknown): KratosSession {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid session payload from Kratos');
    }
    const sessionToken = (payload as { session_token?: unknown }).session_token;
    const session = (payload as { session?: unknown }).session;
    if (typeof sessionToken !== 'string' || !sessionToken) {
      throw new Error('Kratos response missing session token');
    }
    if (!session || typeof session !== 'object') {
      throw new Error('Kratos response missing session details');
    }
    const identity = (session as { identity?: unknown }).identity;
    const identityId = (identity as { id?: unknown })?.id;
    const traits = (identity as { traits?: unknown })?.traits;
    if (typeof identityId !== 'string') {
      throw new Error('Kratos session missing identity id');
    }
    const email =
      traits && typeof traits === 'object'
        ? (traits as KratosIdentityTraits).email
        : undefined;
    return { sessionToken, identityId, email };
  }

  private composeUrl(path: string, flowId?: string): string {
    const basePath = path.startsWith('/') ? path : `/${path}`;
    if (!flowId) {
      return `${this.baseUrl}${basePath}`;
    }
    const url = new URL(`${this.baseUrl}${basePath}`);
    url.searchParams.set('flow', flowId);
    return url.toString();
  }

  private async readJson(response: SimpleResponse): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private toError(
    message: string,
    response: SimpleResponse,
    payload: unknown
  ): KratosClientError {
    const reason =
      payload && typeof payload === 'object' && 'error' in payload
        ? this.extractError(payload)
        : null;
    const composedMessage = reason ? `${message}: ${reason}` : message;
    return new KratosClientError(composedMessage, response.status, payload);
  }

  private extractError(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const errorPayload = (payload as { error?: unknown }).error;
    if (!errorPayload || typeof errorPayload !== 'object') return null;
    const message = (errorPayload as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
}
