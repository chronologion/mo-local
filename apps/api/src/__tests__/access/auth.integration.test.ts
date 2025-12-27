import { describe, expect, it } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import express, { type Request } from 'express';
import { AuthService } from '../../access/application/auth.service';
import { SessionCache } from '../../access/application/session-cache';
import { KratosSessionGuard } from '../../access/presentation/guards/kratos-session.guard';
import type { AuthenticatedIdentity } from '../../access/application/authenticated-identity';
import { IdentityRepository } from '../../access/application/ports/identity-repository';
import { KratosPasswordService } from '../../access/infrastructure/kratos-password.service';
import { KratosClient } from '../../access/infrastructure/kratos.client';
import { ConfigService } from '@nestjs/config';

type Session = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

const makeConfigService = () =>
  new ConfigService({ KRATOS_PUBLIC_URL: 'http://localhost:4455' });

class StubKratosPasswordService extends KratosPasswordService {
  constructor(
    private readonly session: Session,
    private readonly fail = false
  ) {
    super(makeConfigService());
  }

  override async register(): Promise<Session> {
    if (this.fail) throw new Error('Register failed');
    return this.session;
  }

  override async login(): Promise<Session> {
    if (this.fail) throw new Error('Login failed');
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

class StubIdentityRepository extends IdentityRepository {
  public ensured: string[] = [];

  async ensureExists(params: { id: string }): Promise<void> {
    this.ensured.push(params.id);
  }
}

const makeContext = (request: Request) =>
  new ExecutionContextHost([request, {}]);

describe('auth service + guard', () => {
  const session: Session = {
    sessionToken: 'session-token-123',
    identityId: 'identity-1',
    email: 'user@example.com',
  };

  const identity: AuthenticatedIdentity = {
    id: session.identityId,
    traits: { email: session.email },
  };

  it('auth service login ensures identity exists', async () => {
    const identities = new StubIdentityRepository();
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient(identity),
      identities
    );
    const result = await authService.login(session.email ?? '', 'password123');
    expect(result).toEqual(session);
    expect(identities.ensured).toEqual([session.identityId]);
  });

  it('auth service wraps registration errors', async () => {
    const identities = new StubIdentityRepository();
    const authService = new AuthService(
      new StubKratosPasswordService(session, true),
      new StubKratosClient(identity),
      identities
    );
    await expect(
      authService.register(session.email ?? '', 'password123')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guard accepts valid sessions and stores identity on request', async () => {
    const identities = new StubIdentityRepository();
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient(identity),
      identities
    );
    const guard = new KratosSessionGuard(authService, new SessionCache());
    const request: Request & { authIdentity?: AuthenticatedIdentity } =
      Object.create(express.request);
    request.headers = { 'x-session-token': session.sessionToken };
    const allowed = await guard.canActivate(makeContext(request));
    expect(allowed).toBe(true);
    expect(request.authIdentity).toEqual(identity);
  });

  it('guard rejects missing sessions', async () => {
    const identities = new StubIdentityRepository();
    const authService = new AuthService(
      new StubKratosPasswordService(session),
      new StubKratosClient(identity),
      identities
    );
    const guard = new KratosSessionGuard(authService, new SessionCache());
    const request: Request = Object.create(express.request);
    request.headers = {};
    await expect(
      guard.canActivate(makeContext(request))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
