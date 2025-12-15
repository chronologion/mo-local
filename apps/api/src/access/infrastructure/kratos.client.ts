import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedIdentity } from '../application/authenticated-identity';

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null;

@Injectable()
export class KratosClient {
  constructor(private readonly config: ConfigService) {}

  async whoAmI(sessionToken?: string): Promise<AuthenticatedIdentity> {
    const kratosUrl = this.config.get<string>('KRATOS_PUBLIC_URL');

    if (!kratosUrl) {
      throw new Error('KRATOS_PUBLIC_URL is required to validate sessions');
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
    };

    if (sessionToken) {
      headers['x-session-token'] = sessionToken;
    }

    const response = await fetch(new URL('/sessions/whoami', kratosUrl), {
      headers,
      redirect: 'manual',
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (!response.ok) {
      throw new UnauthorizedException(
        `Unable to validate session (status ${response.status})`
      );
    }

    const payload = await this.readJson(response);
    const parsed = this.parseWhoAmI(payload);
    const { id, traits } = parsed.identity;

    return { id, traits };
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

  private parseWhoAmI(payload: unknown): {
    identity: { id: string; traits: Record<string, unknown> };
  } {
    if (!isObject(payload)) {
      throw new UnauthorizedException('Invalid whoami response from Kratos');
    }
    const identity = payload.identity;
    if (!isObject(identity)) {
      throw new UnauthorizedException(
        'Kratos whoami response missing identity'
      );
    }
    const id = identity.id;
    if (typeof id !== 'string' || !id) {
      throw new UnauthorizedException('Kratos identity id is missing');
    }
    const traits =
      isObject(identity.traits) && !Array.isArray(identity.traits)
        ? identity.traits
        : {};
    return { identity: { id, traits } };
  }
}
