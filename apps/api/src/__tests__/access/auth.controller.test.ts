import { describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../../access/presentation/controllers/auth.controller';
import { MeController } from '../../access/presentation/controllers/me.controller';
import { AuthService } from '../../access/application/auth.service';
import { SessionCache } from '../../access/application/session-cache';
import { IdentityRepository } from '../../access/application/ports/identity-repository';
import { KratosPasswordService } from '../../access/infrastructure/kratos-password.service';
import { KratosClient } from '../../access/infrastructure/kratos.client';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedIdentity } from '../../access/application/authenticated-identity';
import { SESSION_COOKIE_NAME } from '../../access/presentation/session-cookie';

type Session = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

const makeResponse = (): Response => {
  const res = Object.create(express.response) as Response;
  res.cookie = vi.fn() as Response['cookie'];
  res.clearCookie = vi.fn() as Response['clearCookie'];
  const req = Object.create(express.request) as Request;
  req.headers = {};
  res.req = req;
  return res;
};

const makeConfigService = () =>
  new ConfigService({ KRATOS_PUBLIC_URL: 'http://localhost:4455' });

class StubIdentityRepository extends IdentityRepository {
  async ensureExists(): Promise<void> {
    return;
  }
}

class StubKratosPasswordService extends KratosPasswordService {
  constructor(private readonly session: Session) {
    super(makeConfigService());
  }

  override async register(): Promise<Session> {
    return this.session;
  }

  override async login(): Promise<Session> {
    return this.session;
  }

  override async logout(): Promise<void> {
    return;
  }
}

class StubKratosClient extends KratosClient {
  constructor(private readonly identity: AuthenticatedIdentity) {
    super(makeConfigService());
  }

  override async whoAmI(): Promise<AuthenticatedIdentity> {
    return this.identity;
  }
}

describe('AuthController', () => {
  it('registers via AuthService and sets cookie', async () => {
    const session: Session = {
      sessionToken: 'session-token',
      identityId: 'identity-1',
      email: 'user@example.com',
    };
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient({
        id: session.identityId,
        traits: { email: session.email },
      }),
      new StubIdentityRepository()
    );
    const registerSpy = vi.spyOn(authService, 'register');
    const controller = new AuthController(authService, new SessionCache());
    const res = makeResponse();

    const result = await controller.register(
      { email: session.email ?? '', password: 'password123' },
      res
    );

    expect(result).toEqual({
      identityId: session.identityId,
      email: session.email,
    });
    expect(registerSpy).toHaveBeenCalledWith(session.email, 'password123');
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      session.sessionToken,
      expect.objectContaining({ httpOnly: true, path: '/' })
    );
  });

  it('logs in via AuthService and sets cookie', async () => {
    const session: Session = {
      sessionToken: 'session-token',
      identityId: 'identity-2',
      email: 'user2@example.com',
    };
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient({
        id: session.identityId,
        traits: { email: session.email },
      }),
      new StubIdentityRepository()
    );
    const loginSpy = vi.spyOn(authService, 'login');
    const controller = new AuthController(authService, new SessionCache());
    const res = makeResponse();

    const result = await controller.login(
      { email: session.email ?? '', password: 'password123' },
      res
    );

    expect(result).toEqual({
      identityId: session.identityId,
      email: session.email,
    });
    expect(loginSpy).toHaveBeenCalledWith(session.email, 'password123');
    expect(res.cookie).toHaveBeenCalled();
  });

  it('returns whoami identity and email', () => {
    const controller = new AuthController(
      new AuthService(
        new StubKratosPasswordService({
          sessionToken: 'session-token',
          identityId: 'identity-3',
          email: 'user3@example.com',
        }),
        new StubKratosClient({
          id: 'identity-3',
          traits: { email: 'user3@example.com' },
        }),
        new StubIdentityRepository()
      ),
      new SessionCache()
    );
    const identity: AuthenticatedIdentity = {
      id: 'identity-3',
      traits: { email: 'user3@example.com' },
    };
    expect(controller.whoami(identity)).toEqual({
      identityId: identity.id,
      email: 'user3@example.com',
    });
  });

  it('throws if whoami called without identity', () => {
    const controller = new AuthController(
      new AuthService(
        new StubKratosPasswordService({
          sessionToken: 'session-token',
          identityId: 'identity-3',
        }),
        new StubKratosClient({
          id: 'identity-3',
          traits: {},
        }),
        new StubIdentityRepository()
      ),
      new SessionCache()
    );
    expect(() => controller.whoami(undefined)).toThrow(BadRequestException);
  });

  it('logs out using body token, header token, or cookie', async () => {
    const session: Session = {
      sessionToken: 'session-token',
      identityId: 'identity-5',
    };
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient({ id: session.identityId, traits: {} }),
      new StubIdentityRepository()
    );
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue();
    const controller = new AuthController(authService, new SessionCache());
    const res = makeResponse();
    res.req.headers = { cookie: `${SESSION_COOKIE_NAME}=cookie-token` };

    await controller.logout({ sessionToken: 'body-token' }, undefined, res);
    expect(logoutSpy).toHaveBeenCalledWith('body-token');
    logoutSpy.mockClear();

    await controller.logout(
      undefined as unknown as { sessionToken: string },
      'header-token',
      res
    );
    await controller.logout(
      undefined as unknown as { sessionToken: string },
      undefined,
      res
    );

    expect(logoutSpy).toHaveBeenCalledWith('header-token');
    expect(logoutSpy).toHaveBeenCalledWith('cookie-token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({ path: '/' })
    );
  });
});

describe('MeController', () => {
  it('returns identity when present', () => {
    const controller = new MeController();
    const identity: AuthenticatedIdentity = {
      id: 'identity-4',
      traits: { email: 'user4@example.com' },
    };
    expect(controller.getProfile(identity)).toEqual(identity);
  });

  it('throws when identity missing', () => {
    const controller = new MeController();
    expect(() => controller.getProfile(undefined)).toThrowError(
      'Authenticated identity is missing from request context'
    );
  });
});
