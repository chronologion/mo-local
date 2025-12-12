import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { AuthService } from '../../application/auth.service';

@Injectable()
export class KratosSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionTokenHeader = request.headers['x-session-token'];
    const sessionToken =
      typeof sessionTokenHeader === 'string'
        ? sessionTokenHeader
        : Array.isArray(sessionTokenHeader)
          ? sessionTokenHeader[0]
          : undefined;

    if (!sessionToken) {
      throw new UnauthorizedException('x-session-token header is required');
    }

    const authUser = await this.authService.validateSession(sessionToken);
    (request as RequestWithAuthUser).authUser = authUser;
    return true;
  }
}

interface RequestWithAuthUser extends Request {
  authUser?: AuthenticatedUser;
}
