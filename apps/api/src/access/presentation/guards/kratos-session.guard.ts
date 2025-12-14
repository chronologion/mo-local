import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedIdentity } from '../../application/authenticated-identity';
import { AuthService } from '../../application/auth.service';
import { SESSION_COOKIE_NAME, parseCookies } from '../session-cookie';

type CacheEntry = {
  value: AuthenticatedIdentity;
  expiresAt: number;
};

@Injectable()
export class KratosSessionGuard implements CanActivate {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs = Number(process.env.SESSION_CACHE_TTL_MS ?? '30000');

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionTokenHeader = request.headers['x-session-token'];
    const cookies = parseCookies(request.headers.cookie as string | undefined);
    const sessionToken =
      typeof sessionTokenHeader === 'string'
        ? sessionTokenHeader
        : Array.isArray(sessionTokenHeader)
          ? sessionTokenHeader[0]
          : cookies[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      throw new UnauthorizedException('Session token is required');
    }

    const cached = this.readCache(sessionToken);
    const authIdentity =
      cached ?? (await this.authService.validateSession(sessionToken));

    if (!cached) {
      this.writeCache(sessionToken, authIdentity);
    }

    (request as RequestWithAuthIdentity).authIdentity = authIdentity;
    return true;
  }

  private readCache(token: string): AuthenticatedIdentity | null {
    const entry = this.cache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    return entry.value;
  }

  private writeCache(token: string, value: AuthenticatedIdentity): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(token, { value, expiresAt });
  }
}

interface RequestWithAuthIdentity extends Request {
  authIdentity?: AuthenticatedIdentity;
}
