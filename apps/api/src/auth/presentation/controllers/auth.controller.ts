import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RegisterDto, LoginDto, LogoutDto } from '../dto/auth.dto';
import { AuthService } from '../../application/auth.service';
import { KratosSessionGuard } from '../guards/kratos-session.guard';
import { AuthUser } from '../../auth-user.decorator';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import {
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  parseCookies,
} from '../session-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const session = await this.auth.register(dto.email, dto.password);
    res.cookie(SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { identityId: session.identityId, email: session.email };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const session = await this.auth.login(dto.email, dto.password);
    res.cookie(SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { identityId: session.identityId, email: session.email };
  }

  @Get('whoami')
  @UseGuards(KratosSessionGuard)
  whoami(@AuthUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new BadRequestException('Authenticated user missing from context');
    }
    const email =
      typeof user.traits.email === 'string' ? user.traits.email : undefined;
    return { identityId: user.id, email };
  }

  @Post('logout')
  async logout(
    @Body() dto: LogoutDto,
    @Headers('x-session-token') sessionHeader: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    const token =
      dto?.sessionToken ??
      (Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader) ??
      parseCookies(res.req.headers.cookie as string | undefined)[
        SESSION_COOKIE_NAME
      ];
    if (token) {
      await this.auth.logout(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { revoked: true };
  }
}
