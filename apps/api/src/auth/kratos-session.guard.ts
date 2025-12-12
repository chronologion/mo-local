import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from './auth.types';
import { KratosClient } from './kratos.client';
import { UserProvisioner } from './user-provisioner.service';

@Injectable()
export class KratosSessionGuard implements CanActivate {
  constructor(
    private readonly kratosClient: KratosClient,
    private readonly userProvisioner: UserProvisioner
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieHeader = request.headers.cookie;
    const sessionTokenHeader = request.headers['x-session-token'];
    const sessionToken =
      typeof sessionTokenHeader === 'string'
        ? sessionTokenHeader
        : Array.isArray(sessionTokenHeader)
          ? sessionTokenHeader[0]
          : undefined;

    const authUser = await this.kratosClient.whoAmI(cookieHeader, sessionToken);
    await this.userProvisioner.ensureExists(authUser);
    (request as RequestWithAuthUser).authUser = authUser;
    return true;
  }
}

interface RequestWithAuthUser extends Request {
  authUser?: AuthenticatedUser;
}
