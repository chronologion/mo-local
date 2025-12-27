import 'reflect-metadata';
import { randomUUID } from 'crypto';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IdentityRepository } from '../../access/application/ports/identity-repository';
import { KratosPasswordService } from '../../access/infrastructure/kratos-password.service';
import { KratosClient } from '../../access/infrastructure/kratos.client';
import { AuthenticatedIdentity } from '../../access/application/authenticated-identity';
import { SESSION_COOKIE_NAME } from '../../access/presentation/session-cookie';
import { AuthService } from '../../access/application/auth.service';
import { SessionCache } from '../../access/application/session-cache';
import { AuthController } from '../../access/presentation/controllers/auth.controller';
import { MeController } from '../../access/presentation/controllers/me.controller';
import { KratosSessionGuard } from '../../access/presentation/guards/kratos-session.guard';

class FakeIdentityRepository extends IdentityRepository {
  ids = new Set<string>();

  async ensureExists(params: { id: string }): Promise<void> {
    this.ids.add(params.id);
  }

  reset() {
    this.ids.clear();
  }
}

type FakeSession = {
  identityId: string;
  email: string;
};

class FakeKratosPasswordService {
  private users = new Map<string, { password: string; identityId: string }>();
  private sessions = new Map<string, FakeSession>();

  reset(): void {
    this.users.clear();
    this.sessions.clear();
  }

  async register(email: string, password: string) {
    if (password === 'breached-password') {
      throw new Error(
        'The password does not fulfill the password policy because it was found in data breaches.'
      );
    }
    const identityId = randomUUID();
    this.users.set(email, { password, identityId });
    const sessionToken = this.issueSession(identityId, email);
    return { sessionToken, identityId, email };
  }

  async login(email: string, password: string) {
    const user = this.users.get(email);
    if (!user || user.password !== password) {
      throw new Error('Email or password is incorrect.');
    }
    const sessionToken = this.issueSession(user.identityId, email);
    return { sessionToken, identityId: user.identityId, email };
  }

  async logout(sessionToken: string): Promise<void> {
    this.sessions.delete(sessionToken);
  }

  getSession(token: string | undefined): FakeSession | undefined {
    if (!token) return undefined;
    return this.sessions.get(token);
  }

  private issueSession(identityId: string, email: string): string {
    const token = `sess-${randomUUID()}`;
    this.sessions.set(token, { identityId, email });
    return token;
  }
}

class FakeKratosClient {
  constructor(private readonly passwords: FakeKratosPasswordService) {}

  async whoAmI(sessionToken?: string): Promise<AuthenticatedIdentity> {
    const session = this.passwords.getSession(sessionToken);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    return { id: session.identityId, traits: { email: session.email } };
  }
}

describe('Access auth endpoints (integration, in-memory Kratos)', () => {
  let app: INestApplication;
  let fakePasswords: FakeKratosPasswordService;
  let fakeKratos: FakeKratosClient;
  let fakeIdentities: FakeIdentityRepository;

  beforeAll(async () => {
    fakePasswords = new FakeKratosPasswordService();
    fakeKratos = new FakeKratosClient(fakePasswords);
    fakeIdentities = new FakeIdentityRepository();

    // Manually wire the application service with fakes (no DB connection).
    const authService = new AuthService(
      fakePasswords as unknown as KratosPasswordService,
      fakeKratos as unknown as KratosClient,
      fakeIdentities
    );
    const sessionCache = new SessionCache();
    const sessionGuard = new KratosSessionGuard(authService, sessionCache);

    // Ensure Nest has constructor metadata for the controller.
    Reflect.defineMetadata(
      'design:paramtypes',
      [AuthService, SessionCache],
      AuthController
    );
    Reflect.defineMetadata(
      'design:paramtypes',
      [AuthService, SessionCache],
      KratosSessionGuard
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, MeController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SessionCache, useValue: sessionCache },
        { provide: KratosSessionGuard, useValue: sessionGuard },
        { provide: KratosPasswordService, useValue: fakePasswords },
        { provide: KratosClient, useValue: fakeKratos },
        { provide: IdentityRepository, useValue: fakeIdentities },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakePasswords.reset();
    fakeIdentities.reset();
  });

  it('registers a user, sets session cookie (httpOnly, not secure by default), and upserts identity', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'supersecret' })
      .expect(201);

    expect(res.body.identityId).toBeDefined();
    expect(res.body.email).toBe('alice@example.com');
    const setCookie = cookieHeader(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).not.toContain('secure');
    expect(fakeIdentities.ids.has(res.body.identityId)).toBe(true);
  });

  it('surfaces register validation errors from Kratos', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'breached-password' })
      .expect(400);

    expect(res.body.message).toContain('password policy');
  });

  it('rejects login with bad credentials and returns friendly message', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'supersecret' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpass' })
      .expect(400);

    expect(res.body.message).toContain('Email or password is incorrect');
  });

  it('logs in, returns identity + email, and sets session cookie', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'supersecret' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'supersecret' })
      .expect(201);

    expect(res.body.identityId).toBeDefined();
    expect(res.body.email).toBe('alice@example.com');
    const setCookie = cookieHeader(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('whoami succeeds with session cookie and fails without it', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'supersecret' })
      .expect(201);
    const cookie = cookieHeader(login.headers['set-cookie']);

    const ok = await request(app.getHttpServer())
      .get('/auth/whoami')
      .set('Cookie', cookie)
      .expect(200);
    expect(ok.body.identityId).toBeDefined();
    expect(ok.body.email).toBe('bob@example.com');

    await request(app.getHttpServer()).get('/auth/whoami').expect(401);
  });

  it('me endpoint requires a valid session and returns traits', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'carol@example.com', password: 'supersecret' })
      .expect(201);
    const cookie = cookieHeader(login.headers['set-cookie']);

    const me = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(me.body.id).toBeDefined();
    expect(me.body.traits.email).toBe('carol@example.com');

    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('logout clears the session cookie and invalidates the session', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dave@example.com', password: 'supersecret' })
      .expect(201);
    const cookie = cookieHeader(login.headers['set-cookie']);

    await request(app.getHttpServer())
      .get('/auth/whoami')
      .set('Cookie', cookie)
      .expect(200);

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .send({})
      .expect(201);

    const cleared = cookieHeader(logout.headers['set-cookie']);
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);

    await request(app.getHttpServer())
      .get('/auth/whoami')
      .set('Cookie', cookie)
      .expect(401);
  });
});

function cookieHeader(header: string | string[] | undefined): string {
  if (Array.isArray(header)) return header.join(';');
  return header ?? '';
}
