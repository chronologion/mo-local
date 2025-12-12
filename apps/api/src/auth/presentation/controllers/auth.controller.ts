import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RegisterDto, LoginDto, LogoutDto } from '../dto/auth.dto';
import { AuthService } from '../../application/auth.service';
import { KratosSessionGuard } from '../guards/kratos-session.guard';
import { AuthUser } from '../../auth-user.decorator';
import { AuthenticatedUser } from '../../domain/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('whoami')
  @UseGuards(KratosSessionGuard)
  whoami(
    @Headers('x-session-token') sessionToken: string | undefined,
    @AuthUser() user: AuthenticatedUser | undefined
  ) {
    if (!sessionToken) {
      throw new BadRequestException('x-session-token header is required');
    }
    if (!user) {
      throw new BadRequestException('Authenticated user missing from context');
    }
    const email =
      typeof user.traits.email === 'string' ? user.traits.email : undefined;
    return { identityId: user.id, email };
  }

  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.sessionToken);
    return { revoked: true };
  }
}
