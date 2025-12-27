import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedIdentity } from '../../application/authenticated-identity';
import { AuthService } from '../../application/auth.service';
import { SessionCache } from '../../application/session-cache';
import { SESSION_COOKIE_NAME, parseCookies } from '../session-cookie';

@Injectable()
export class KratosSessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCache: SessionCache
  ) {}

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

    const cached = this.sessionCache.read(sessionToken);
    const authIdentity =
      cached ?? (await this.authService.validateSession(sessionToken));

    if (!cached) {
      this.sessionCache.write(sessionToken, authIdentity);
    }

    (request as RequestWithAuthIdentity).authIdentity = authIdentity;
    return true;
  }
}

interface RequestWithAuthIdentity extends Request {
  authIdentity?: AuthenticatedIdentity;
}
