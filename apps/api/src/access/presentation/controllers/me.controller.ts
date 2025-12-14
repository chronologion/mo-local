import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthIdentity } from '../../auth-identity.decorator';
import { KratosSessionGuard } from '../guards/kratos-session.guard';
import { AuthenticatedIdentity } from '../../application/authenticated-identity';

@Controller('me')
@UseGuards(KratosSessionGuard)
export class MeController {
  @Get()
  getProfile(
    @AuthIdentity() identity: AuthenticatedIdentity | undefined
  ): AuthenticatedIdentity {
    if (!identity) {
      throw new Error('Authenticated identity is missing from request context');
    }
    return identity;
  }
}
