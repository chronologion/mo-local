import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RegisterDto, LoginDto, LogoutDto } from '../dto/auth.dto';
import { AuthService } from '../../application/auth.service';
import { SessionCache } from '../../application/session-cache';
import { KratosSessionGuard } from '../guards/kratos-session.guard';
import { AuthIdentity } from '../../auth-identity.decorator';
import { AuthenticatedIdentity } from '../../application/authenticated-identity';
import {
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECURE,
  parseCookies,
} from '../session-cookie';

const getRequestHost = (res: Response): string | null => {
  const req = res.req;
  if (!req) return null;
  const hostHeader = req.headers?.host;
  const host =
    typeof hostHeader === 'string'
      ? hostHeader
      : Array.isArray(hostHeader)
        ? hostHeader[0]
        : null;
  if (!host) return null;
  return host.split(':')[0] ?? null;
};

const clearSessionCookie = (res: Response): void => {
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: SESSION_COOKIE_SECURE,
    path: '/',
  };

  // Clear host-only cookie.
  res.clearCookie(SESSION_COOKIE_NAME, options);
  res.cookie(SESSION_COOKIE_NAME, '', { ...options, maxAge: 0 });

  // Clear domain cookie variants (Safari can behave differently depending on how the cookie was set).
  const host = getRequestHost(res);
  if (host) {
    res.clearCookie(SESSION_COOKIE_NAME, { ...options, domain: host });
    res.cookie(SESSION_COOKIE_NAME, '', {
      ...options,
      domain: host,
      maxAge: 0,
    });
    if (host === 'localhost') {
      res.clearCookie(SESSION_COOKIE_NAME, {
        ...options,
        domain: '.localhost',
      });
      res.cookie(SESSION_COOKIE_NAME, '', {
        ...options,
        domain: '.localhost',
        maxAge: 0,
      });
    }
  }
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly sessionCache: SessionCache
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const session = await this.auth.register(dto.email, dto.password);
    res.cookie(SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SESSION_COOKIE_SECURE,
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
      secure: SESSION_COOKIE_SECURE,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { identityId: session.identityId, email: session.email };
  }

  @Get('whoami')
  @UseGuards(KratosSessionGuard)
  whoami(@AuthIdentity() identity: AuthenticatedIdentity | undefined) {
    if (!identity) {
      throw new BadRequestException(
        'Authenticated identity missing from context'
      );
    }
    const email =
      typeof identity.traits.email === 'string'
        ? identity.traits.email
        : undefined;
    return { identityId: identity.id, email };
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
    clearSessionCookie(res);
    if (!token) {
      return { revoked: false };
    }
    try {
      await this.auth.logout(token);
      return { revoked: true };
    } catch (error) {
      // Logout is best-effort: the browser cookie being cleared is what matters
      // for stopping access in this app. Kratos revocation can fail transiently.
      const message =
        error instanceof Error ? error.message : 'Unknown logout error';
      this.logger.warn(`Kratos logout failed: ${message}`);
      return { revoked: false };
    } finally {
      this.sessionCache.invalidate(token);
    }
  }
}
