import 'reflect-metadata';
import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SyncController } from '../../sync/presentation/sync.controller';
import { SyncService } from '../../sync/application/sync.service';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
} from '../../sync/application/ports/sync-event-repository';
import { SyncStoreRepository } from '../../sync/application/ports/sync-store-repository';
import { SyncAccessPolicy } from '../../sync/application/ports/sync-access-policy';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import { SyncEvent } from '../../sync/domain/SyncEvent';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import { AuthenticatedIdentity } from '../../access/application/authenticated-identity';
import { KratosSessionGuard } from '../../access/presentation/guards/kratos-session.guard';

class InMemorySyncEventRepository extends SyncEventRepository {
  private events: SyncEvent[] = [];

  async getHeadSequence(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId
  ): Promise<GlobalSequenceNumber> {
    const head = this.events
      .filter(
        (event) =>
          event.ownerId.unwrap() === ownerId.unwrap() &&
          event.storeId.unwrap() === storeId.unwrap()
      )
      .reduce((max, event) => Math.max(max, event.seqNum.unwrap()), 0);
    return GlobalSequenceNumber.from(head);
  }

  async appendBatch(events: SyncEvent[]): Promise<void> {
    for (const event of events) {
      const exists = this.events.some(
        (e) =>
          e.ownerId.unwrap() === event.ownerId.unwrap() &&
          e.storeId.unwrap() === event.storeId.unwrap() &&
          e.seqNum.unwrap() === event.seqNum.unwrap()
      );
      if (exists) {
        throw new SyncRepositoryConflictError(
          'Duplicate sequence number for stream'
        );
      }
      this.events.push(event);
    }
    this.events.sort((a, b) => a.seqNum.unwrap() - b.seqNum.unwrap());
  }

  async loadSince(
    ownerId: SyncOwnerId,
    storeId: SyncStoreId,
    since: GlobalSequenceNumber,
    limit: number
  ): Promise<SyncEvent[]> {
    return this.events
      .filter(
        (event) =>
          event.ownerId.unwrap() === ownerId.unwrap() &&
          event.storeId.unwrap() === storeId.unwrap() &&
          event.seqNum.unwrap() > since.unwrap()
      )
      .sort((a, b) => a.seqNum.unwrap() - b.seqNum.unwrap())
      .slice(0, limit);
  }
}

class InMemorySyncStoreRepository extends SyncStoreRepository {
  private owners = new Map<string, string>();

  async ensureStoreOwner(
    storeId: SyncStoreId,
    ownerId: SyncOwnerId
  ): Promise<void> {
    const existing = this.owners.get(storeId.unwrap());
    if (!existing) {
      this.owners.set(storeId.unwrap(), ownerId.unwrap());
      return;
    }
    if (existing !== ownerId.unwrap()) {
      throw new Error('Store owned by another identity');
    }
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

const makeEvent = (
  seqNum: number,
  parentSeqNum: number
): LiveStoreEvent.Global.Encoded => ({
  name: 'test.event',
  args: { payload: seqNum },
  seqNum: EventSequenceNumber.Global.make(seqNum),
  parentSeqNum: EventSequenceNumber.Global.make(parentSeqNum),
  clientId: 'client-1',
  sessionId: 'session-1',
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
          useFactory: (
            repo: SyncEventRepository,
            storeRepo: SyncStoreRepository,
            accessPolicy: SyncAccessPolicy
          ) => new SyncService(repo, storeRepo, accessPolicy),
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

    const controller = app.get(SyncController) as SyncController & {
      syncService?: SyncService;
    };
    controller.syncService = app.get(SyncService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects pushes when server is ahead and preserves client sequence numbers', async () => {
    await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: 'store-1',
        events: [makeEvent(1, 0)],
      })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/sync/push')
      .set('x-session-token', 'fake')
      .send({
        storeId: 'store-1',
        events: [makeEvent(1, 0)],
      })
      .expect(409);

    expect(conflict.body.minimumExpectedSeqNum).toBe(2);
    expect(conflict.body.providedSeqNum).toBe(1);

    const pull = await request(app.getHttpServer())
      .get('/sync/pull')
      .set('x-session-token', 'fake')
      .query({ storeId: 'store-1', since: 0, limit: 10 })
      .expect(200);

    expect(pull.body.events).toEqual([
      expect.objectContaining({ seqNum: 1, parentSeqNum: 0 }),
    ]);
    expect(pull.body.headSeqNum).toBe(1);
  });
});
