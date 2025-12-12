import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JsonObject = Record<string, unknown>;

type KratosSession = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null;

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

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

  async logout(sessionToken: string): Promise<void> {
    await this.requestJson(
      '/self-service/logout/api',
      {
        method: 'DELETE',
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
    const flowPayload = await this.requestJson(params.flowPath, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
    });

    if (!isObject(flowPayload)) {
      throw new Error(params.errorMessage);
    }
    const flowId = flowPayload.id;
    if (typeof flowId !== 'string' || !flowId) {
      throw new Error('Kratos flow response missing flow id');
    }

    const ui = flowPayload.ui;
    const nodes = isObject(ui) && isUnknownArray(ui.nodes) ? ui.nodes : [];
    const csrfToken = nodes
      .map((node) => (isObject(node) ? node.attributes : null))
      .filter(isObject)
      .find((attrs) => attrs.name === 'csrf_token');
    const csrfValue =
      csrfToken && typeof csrfToken.value === 'string' ? csrfToken.value : '';

    const body: Record<string, unknown> = {
      ...params.payload,
      ...(csrfValue ? { csrf_token: csrfValue } : {}),
    };

    const responsePayload = await this.requestJson(
      `${params.submitPath}?flow=${flowId}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!isObject(responsePayload)) {
      throw new Error(params.errorMessage);
    }

    const sessionToken = responsePayload.session_token;
    if (typeof sessionToken !== 'string' || !sessionToken) {
      throw new Error(params.errorMessage);
    }
    const session = responsePayload.session;
    if (!isObject(session)) {
      throw new Error(params.errorMessage);
    }
    const identity = session.identity;
    if (!isObject(identity)) {
      throw new Error(params.errorMessage);
    }
    const identityId = identity.id;
    if (typeof identityId !== 'string' || !identityId) {
      throw new Error(params.errorMessage);
    }
    const traits = identity.traits;
    const email =
      isObject(traits) && typeof traits.email === 'string'
        ? traits.email
        : undefined;
    return {
      sessionToken,
      identityId,
      email,
    };
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    okStatuses: number[] = [200]
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, init);
    const payload = await this.readJson(response);
    if (!okStatuses.includes(response.status)) {
      const reason = this.extractErrorMessage(payload);
      const message = reason ?? `Kratos request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch {
      return text;
    }
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (!isObject(payload)) return null;
    const error = payload.error;
    if (!isObject(error)) return null;
    const message = error.message;
    return typeof message === 'string' ? message : null;
  }
}
