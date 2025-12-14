import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { AuthService } from '../../application/auth.service';
import { SESSION_COOKIE_NAME, parseCookies } from '../session-cookie';

@Injectable()
export class KratosSessionGuard implements CanActivate {
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

    const authUser = await this.authService.validateSession(sessionToken);
    (request as RequestWithAuthUser).authUser = authUser;
    return true;
  }
}

interface RequestWithAuthUser extends Request {
  authUser?: AuthenticatedUser;
}
