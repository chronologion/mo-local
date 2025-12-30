import { describe, expect, it } from 'vitest';
import {
  InMemoryIdempotencyStore,
  InMemoryKeyStore,
  InMemoryProjectRepository,
  MockCryptoService,
} from '../../fixtures/ports';
import { ProjectCommandHandler } from '../../../src/projects/ProjectCommandHandler';
import { ConcurrencyError } from '../../../src/errors/ConcurrencyError';
import { ProjectId } from '@mo/domain';
import {
  CreateProject,
  ChangeProjectStatus,
  ChangeProjectName,
  ChangeProjectDescription,
  ChangeProjectDates,
} from '../../../src/projects/commands';
import { ValidationException } from '../../../src/errors/ValidationError';

class CountingCryptoService extends MockCryptoService {
  generateKeyCalls = 0;

  override async generateKey(): Promise<Uint8Array> {
    this.generateKeyCalls += 1;
    return super.generateKey();
  }
}

const projectId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f201';
const actorId = 'user-1';
const baseCreate = () =>
  new CreateProject({
    projectId,
    name: 'Project Alpha',
    status: 'planned',
    startDate: '2025-01-01',
    targetDate: '2025-02-01',
    description: 'desc',
    goalId: null,
    actorId,
    timestamp: Date.now(),
    idempotencyKey: 'idem-create',
  });

const setup = () => {
  const repo = new InMemoryProjectRepository();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const handler = new ProjectCommandHandler(
    repo,
    keyStore,
    crypto,
    idempotencyStore
  );
  return { repo, keyStore, crypto, idempotencyStore, handler };
};

describe('ProjectCommandHandler', () => {
  it('is idempotent for duplicate CreateProject idempotencyKey', async () => {
    const repo = new InMemoryProjectRepository();
    const keyStore = new InMemoryKeyStore();
    const crypto = new CountingCryptoService();
    const idempotencyStore = new InMemoryIdempotencyStore();
    const handler = new ProjectCommandHandler(
      repo,
      keyStore,
      crypto,
      idempotencyStore
    );

    const first = await handler.handleCreate(baseCreate());
    const second = await handler.handleCreate(baseCreate());

    expect(first.projectId).toBe(projectId);
    expect(second.projectId).toBe(projectId);
    if (!('encryptionKey' in first) || !('encryptionKey' in second)) {
      throw new Error('Expected create result to include encryptionKey');
    }
    expect(Array.from(second.encryptionKey)).toEqual(
      Array.from(first.encryptionKey)
    );
    expect(crypto.generateKeyCalls).toBe(1);
  });

  it('throws when idempotencyKey is reused for a different project', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    const original = baseCreate();
    await expect(
      handler.handleCreate(
        new CreateProject({
          ...original,
          projectId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f299',
          idempotencyKey: original.idempotencyKey,
        })
      )
    ).rejects.toThrow(/Idempotency key reuse detected/);
  });

  it('creates a project and stores aggregate key', async () => {
    const { handler, keyStore, repo } = setup();
    const result = await handler.handleCreate(baseCreate());

    expect(result.projectId).toBe(projectId);
    const storedKey = await keyStore.getAggregateKey(projectId);
    expect(storedKey).toBeInstanceOf(Uint8Array);
    expect(repo.getStoredKey(ProjectId.from(projectId))).toBeDefined();
  });

  it('updates status', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    await handler.handleChangeStatus(
      new ChangeProjectStatus({
        projectId,
        status: 'in_progress',
        actorId,
        timestamp: Date.now(),
        knownVersion: 1,
        idempotencyKey: 'idem-status',
      })
    );
  });

  it('fails when aggregate key missing', async () => {
    const { handler, keyStore } = setup();
    await handler.handleCreate(baseCreate());
    keyStore.removeAggregateKey(projectId);

    await expect(
      handler.handleChangeName(
        new ChangeProjectName({
          projectId,
          name: 'New name',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-name-missing-key',
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('does not publish when repository save fails', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate());
    repo.failNextSave();

    await expect(
      handler.handleChangeDescription(
        new ChangeProjectDescription({
          projectId,
          description: 'New desc',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-desc-fail',
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('surfaces concurrency errors from repository', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate());
    repo.failWith(new ConcurrencyError());

    await expect(
      handler.handleChangeDates(
        new ChangeProjectDates({
          projectId,
          startDate: '2025-01-02',
          targetDate: '2025-03-01',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-dates-concurrency',
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('rejects invalid payloads via ValidationException', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());
    await expect(
      handler.handleChangeStatus(
        new ChangeProjectStatus({
          projectId,
          status: 'not-a-status' as never,
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-invalid-status',
        })
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('throws ConcurrencyError when knownVersion mismatches', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    await expect(
      handler.handleChangeStatus(
        new ChangeProjectStatus({
          projectId,
          status: 'in_progress',
          actorId,
          timestamp: Date.now(),
          knownVersion: 0,
          idempotencyKey: 'idem-status-mismatch',
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
