import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedIdentity } from './application/authenticated-identity';

export const AuthIdentity = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext
  ): AuthenticatedIdentity | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.authIdentity;
  }
);
