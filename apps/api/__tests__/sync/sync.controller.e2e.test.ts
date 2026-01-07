import 'reflect-metadata';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SyncController } from '../../src/sync/presentation/sync.controller';
import { SyncService } from '../../src/sync/application/sync.service';
import { SyncEventRepository } from '../../src/sync/application/ports/sync-event-repository';
import { SyncStoreRepository } from '../../src/sync/application/ports/sync-store-repository';
import { SyncAccessPolicy } from '../../src/sync/application/ports/sync-access-policy';
import { SyncOwnerId } from '../../src/sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../src/sync/domain/value-objects/SyncStoreId';
import { AuthenticatedIdentity } from '../../src/access/application/authenticated-identity';
import { KratosSessionGuard } from '../../src/access/presentation/guards/kratos-session.guard';
import { InMemorySyncEventRepository } from './support/in-memory-sync-event-repository';
import { SyncIncomingEvent } from '../../src/sync/domain/SyncEvent';

const TEST_STORE_ID_V7 = '019b5b7b-c8d0-7961-bb15-60fe00e4e145';

class InMemorySyncStoreRepository extends SyncStoreRepository {
  private owners = new Map<string, string>();

  async ensureStoreOwner(storeId: SyncStoreId, ownerId: SyncOwnerId): Promise<void> {
    const storeIdValue = storeId.unwrap();
    const ownerValue = ownerId.unwrap();
    const existing = this.owners.get(storeIdValue);
    if (existing) {
      if (existing !== ownerValue) {
        throw new Error('Store owned by another identity');
      }
      return;
    }
    this.owners.set(storeIdValue, ownerValue);
  }
}

class AllowAllAccessPolicy extends SyncAccessPolicy {
  async ensureCanPull(): Promise<void> {}
  async ensureCanPush(): Promise<void> {}
}

class FakeSessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest() as {
      authIdentity?: AuthenticatedIdentity;
    };
    req.authIdentity = { id: 'user-1', traits: { email: 'user@example.com' } };
    return true;
  }
}

const makeEvent = (eventId: string, payload: number): SyncIncomingEvent => ({
  eventId,
  recordJson: JSON.stringify({ payload }),
});

describe('SyncController (integration, in-memory repos)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: SyncEventRepository, useClass: InMemorySyncEventRepository },
        { provide: SyncStoreRepository, useClass: InMemorySyncStoreRepository },
        { provide: SyncAccessPolicy, useClass: AllowAllAccessPolicy },
        {
          provide: SyncService,
          useFactory: (repo: SyncEventRepository, storeRepo: SyncStoreRepository, accessPolicy: SyncAccessPolicy) =>
            new SyncService(repo, storeRepo, accessPolicy),
          inject: [SyncEventRepository, SyncStoreRepository, SyncAccessPolicy],
        },
      ],
    })
      .overrideGuard(KratosSessionGuard)
      .useClass(FakeSessionGuard)
      .compile();

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

  it('rejects pushes when server is ahead and returns missing events', async () => {
    await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: TEST_STORE_ID_V7,
        expectedHead: 0,
        events: [makeEvent('e1', 1)],
      })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: TEST_STORE_ID_V7,
        expectedHead: 0,
        events: [makeEvent('e2', 2)],
      })
      .expect(409);

    expect(conflict.body.ok).toBe(false);
    expect(conflict.body.reason).toBe('server_ahead');
    expect(conflict.body.head).toBe(1);
    expect(conflict.body.missing).toEqual([expect.objectContaining({ eventId: 'e1', globalSequence: 1 })]);

    const pull = await request(app.getHttpServer())
      .get('/sync/pull')
      .set('x-session-token', 'fake')
      .query({ storeId: TEST_STORE_ID_V7, since: 0, limit: 10 })
      .expect(200);

    expect(pull.body.events).toEqual([expect.objectContaining({ eventId: 'e1', globalSequence: 1 })]);
    expect(pull.body.head).toBe(1);
  });

  it('returns server_behind after dev reset', async () => {
    await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: TEST_STORE_ID_V7,
        expectedHead: 0,
        events: [makeEvent('e10', 10)],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sync/dev/reset')
      .set('x-session-token', 'fake')
      .send({ storeId: TEST_STORE_ID_V7 })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: TEST_STORE_ID_V7,
        expectedHead: 1,
        events: [makeEvent('e11', 11)],
      })
      .expect(409);

    expect(conflict.body.reason).toBe('server_behind');
    expect(conflict.body.head).toBe(0);
  });
});
