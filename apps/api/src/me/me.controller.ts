import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import { KratosSessionGuard } from '../auth/presentation/guards/kratos-session.guard';
import { AuthenticatedUser } from '../auth/domain/authenticated-user';

@Controller('me')
@UseGuards(KratosSessionGuard)
export class MeController {
  @Get()
  getProfile(
    @AuthUser() user: AuthenticatedUser | undefined
  ): AuthenticatedUser {
    if (!user) {
      throw new Error('Authenticated user is missing from request context');
    }
    return user;
  }
}
