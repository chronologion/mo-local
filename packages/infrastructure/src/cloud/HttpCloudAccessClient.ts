import type { CloudIdentitySession, ICloudAccessClient } from '@mo/application';
import { z } from 'zod';

const sessionResponseSchema = z.object({
  identityId: z.string(),
  email: z.string().optional(),
});

const whoamiResponseSchema = z.object({
  identityId: z.string(),
  email: z.string().optional(),
});

const logoutResponseSchema = z.object({
  revoked: z.boolean(),
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!isObject(payload)) return null;
  if (isObject(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  const message = payload.message;
  if (typeof message === 'string') {
    return message;
  }
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return message.join(' | ');
  }
  return null;
};

export class CloudAccessError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = 'CloudAccessError';
  }
}

export class HttpCloudAccessClient implements ICloudAccessClient {
  constructor(private readonly baseUrl: string) {}

  private buildUrl(path: string): string {
    if (!this.baseUrl.endsWith('/') && !path.startsWith('/')) {
      return `${this.baseUrl}/${path}`;
    }
    if (this.baseUrl.endsWith('/') && path.startsWith('/')) {
      return `${this.baseUrl}${path.slice(1)}`;
    }
    return `${this.baseUrl}${path}`;
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodSchema<T>
  ): Promise<T> {
    let response: Response;
    const url = this.buildUrl(path);

    try {
      response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? `Network error calling ${path}: ${err.message}`
          : `Network error calling ${path}`;
      throw new CloudAccessError(message);
    }

    const payload = await parseJson(response);
    if (!response.ok) {
      const reason =
        extractErrorMessage(payload) ??
        (typeof payload === 'string'
          ? payload
          : (() => {
              try {
                return JSON.stringify(payload);
              } catch {
                return null;
              }
            })());
      const isAuthPath =
        path === '/auth/login' ||
        path === '/auth/register' ||
        path === '/auth/logout';
      let message: string;
      if (reason) {
        const normalized = reason.toLowerCase();
        if (
          path === '/auth/login' &&
          response.status === 400 &&
          (normalized === 'bad request' ||
            normalized.includes('request failed') ||
            normalized.includes('invalid session') ||
            normalized === 'unauthorized')
        ) {
          message = 'Email or password is incorrect.';
        } else {
          message = reason;
        }
      } else if (path === '/auth/login' && response.status === 400) {
        message = 'Email or password is incorrect.';
      } else if (isAuthPath && response.status === 400) {
        message = 'Unable to authenticate with the provided credentials.';
      } else {
        message = `Request to ${path} failed (status ${response.status})`;
      }
      throw new CloudAccessError(message, response.status, payload);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new CloudAccessError(
        `Unexpected response from ${path}`,
        response.status
      );
    }
    return parsed.data;
  }

  async whoAmI(): Promise<CloudIdentitySession | null> {
    try {
      const result = await this.requestJson(
        '/auth/whoami',
        { method: 'GET' },
        whoamiResponseSchema
      );
      return result;
    } catch (error) {
      if (error instanceof CloudAccessError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  async register(params: {
    email: string;
    password: string;
  }): Promise<CloudIdentitySession> {
    const session = await this.requestJson(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          password: params.password,
        }),
      },
      sessionResponseSchema
    );
    return session;
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<CloudIdentitySession> {
    const session = await this.requestJson(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          password: params.password,
        }),
      },
      sessionResponseSchema
    );
    return session;
  }

  async logout(): Promise<{ revoked: boolean }> {
    const result = await this.requestJson(
      '/auth/logout',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      logoutResponseSchema
    );
    return result;
  }
}
