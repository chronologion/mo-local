import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, KratosWhoAmIResponse } from './auth.types';

@Injectable()
export class KratosClient {
  constructor(private readonly config: ConfigService) {}

  async whoAmI(
    cookieHeader?: string,
    sessionToken?: string
  ): Promise<AuthenticatedUser> {
    const kratosUrl = this.config.get<string>('KRATOS_PUBLIC_URL');

    if (!kratosUrl) {
      throw new Error('KRATOS_PUBLIC_URL is required to validate sessions');
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
    };

    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }

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

    const body = (await response.json()) as KratosWhoAmIResponse;
    const { id, traits } = body.identity;

    return { id, traits };
  }
}
