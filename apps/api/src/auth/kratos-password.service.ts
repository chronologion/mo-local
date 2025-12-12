import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type KratosSession = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

@Injectable()
export class KratosPasswordService {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('KRATOS_PUBLIC_URL');
    if (!url) {
      throw new Error('KRATOS_PUBLIC_URL is required for auth flows');
    }
    this.baseUrl = url.replace(/\/+$/, '');
  }

  register(email: string, password: string): Promise<KratosSession> {
    return this.executePasswordFlow({
      flowPath: '/self-service/registration/api?return_session_token=true',
      submitPath: '/self-service/registration',
      payload: {
        method: 'password',
        traits: { email },
        identifier: email,
        password,
      },
      errorMessage: 'Registration failed',
    });
  }

  login(email: string, password: string): Promise<KratosSession> {
    return this.executePasswordFlow({
      flowPath: '/self-service/login/api?return_session_token=true',
      submitPath: '/self-service/login',
      payload: {
        method: 'password',
        identifier: email,
        password,
      },
      errorMessage: 'Login failed',
    });
  }

  whoAmI(
    sessionToken: string
  ): Promise<{ identityId: string; email?: string }> {
    return this.requestJson<{
      identity: { id: string; traits: { email?: string } };
    }>('/sessions/whoami', {
      headers: {
        accept: 'application/json',
        'x-session-token': sessionToken,
      },
    }).then((body) => ({
      identityId: body.identity.id,
      email: body.identity.traits.email,
    }));
  }

  async logout(sessionToken: string): Promise<void> {
    await this.requestJson(
      '/self-service/logout/api',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ session_token: sessionToken }),
      },
      [200, 204]
    );
  }

  private async executePasswordFlow(params: {
    flowPath: string;
    submitPath: string;
    payload: Record<string, unknown>;
    errorMessage: string;
  }): Promise<KratosSession> {
    const flow = await this.requestJson<{
      id: string;
      ui?: {
        nodes?: Array<{ attributes?: { name?: string; value?: string } }>;
      };
    }>(params.flowPath, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
    });
    const csrfToken =
      flow.ui?.nodes?.find((node) => node.attributes?.name === 'csrf_token')
        ?.attributes?.value ?? undefined;
    const body: Record<string, unknown> = {
      ...params.payload,
      ...(csrfToken ? { csrf_token: csrfToken } : {}),
    };
    const response = await this.requestJson<{
      session_token: string;
      session: { identity: { id: string; traits: { email?: string } } };
    }>(`${params.submitPath}?flow=${flow.id}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.session_token) {
      throw new Error(params.errorMessage);
    }
    return {
      sessionToken: response.session_token,
      identityId: response.session.identity.id,
      email: response.session.identity.traits.email,
    };
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    okStatuses: number[] = [200]
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!okStatuses.includes(response.status)) {
      const reason =
        payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: { message?: string } }).error?.message
          : null;
      const message = reason ?? `Kratos request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }
}
