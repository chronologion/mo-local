import { describe, expect, it } from 'vitest';
import { GoalCommandHandler } from '../../../src/goals/GoalCommandHandler';
import {
  InMemoryGoalRepository,
  InMemoryIdempotencyStore,
  InMemoryKeyStore,
  MockCryptoService,
} from '../../fixtures/ports';
import { ConcurrencyError } from '../../../src/errors/ConcurrencyError';
import {
  ChangeGoalPriority,
  ChangeGoalSlice,
  ChangeGoalSummary,
  ChangeGoalTargetMonth,
  CreateGoal,
  AchieveGoal,
  UnachieveGoal,
} from '../../../src/goals/commands';

class CountingCryptoService extends MockCryptoService {
  generateKeyCalls = 0;

  override async generateKey(): Promise<Uint8Array> {
    this.generateKeyCalls += 1;
    return super.generateKey();
  }
}

const goalId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f101';
const actorId = 'user-1';
const baseCreate = new CreateGoal({
  goalId,
  slice: 'Health' as const,
  summary: 'Run a marathon',
  targetMonth: '2025-12',
  priority: 'must' as const,
  actorId,
  timestamp: Date.now(),
  idempotencyKey: 'idem-create',
});

const setup = () => {
  const repo = new InMemoryGoalRepository();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const handler = new GoalCommandHandler(
    repo,
    keyStore,
    crypto,
    idempotencyStore
  );
  return { repo, keyStore, crypto, idempotencyStore, handler };
};

describe('GoalCommandHandler', () => {
  it('is idempotent for duplicate CreateGoal idempotencyKey', async () => {
    const repo = new InMemoryGoalRepository();
    const keyStore = new InMemoryKeyStore();
    const crypto = new CountingCryptoService();
    const idempotencyStore = new InMemoryIdempotencyStore();
    const handler = new GoalCommandHandler(
      repo,
      keyStore,
      crypto,
      idempotencyStore
    );

    const first = await handler.handleCreate(baseCreate);
    const second = await handler.handleCreate(
      new CreateGoal({
        ...baseCreate,
        timestamp: Date.now(),
      })
    );

    expect(first.goalId).toBe(goalId);
    expect(second.goalId).toBe(goalId);
    if (!('encryptionKey' in first) || !('encryptionKey' in second)) {
      throw new Error('Expected create result to include encryptionKey');
    }
    expect(Array.from(second.encryptionKey)).toEqual(
      Array.from(first.encryptionKey)
    );
    expect(crypto.generateKeyCalls).toBe(1);
  });

  it('throws when idempotencyKey is reused for a different goal', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await expect(
      handler.handleCreate(
        new CreateGoal({
          ...baseCreate,
          goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f999',
          idempotencyKey: baseCreate.idempotencyKey,
        })
      )
    ).rejects.toThrow(/Idempotency key reuse detected/);
  });

  it('creates a goal and stores aggregate key', async () => {
    const { handler, keyStore } = setup();

    await handler.handleCreate(baseCreate);

    const storedKey = await keyStore.getAggregateKey(goalId);
    expect(storedKey).toBeInstanceOf(Uint8Array);
  });

  it('updates summary', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await handler.handleChangeSummary(
      new ChangeGoalSummary({
        goalId,
        summary: 'Run a faster marathon',
        actorId,
        timestamp: Date.now(),
        knownVersion: 1,
        idempotencyKey: 'idem-summary',
      })
    );
  });

  it('marks a goal as achieved', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await handler.handleAchieve(
      new AchieveGoal({
        goalId,
        actorId,
        timestamp: Date.now(),
        knownVersion: 1,
        idempotencyKey: 'idem-achieve',
      })
    );
  });

  it('marks a goal as not achieved', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await handler.handleAchieve(
      new AchieveGoal({
        goalId,
        actorId,
        timestamp: Date.now(),
        knownVersion: 1,
        idempotencyKey: 'idem-achieve-unachieve',
      })
    );

    await handler.handleUnachieve(
      new UnachieveGoal({
        goalId,
        actorId,
        timestamp: Date.now(),
        knownVersion: 2,
        idempotencyKey: 'idem-unachieve',
      })
    );
  });

  it('fails when aggregate key missing', async () => {
    const { handler, keyStore } = setup();
    await handler.handleCreate(baseCreate);
    keyStore.removeAggregateKey(goalId);

    await expect(
      handler.handleChangeSummary(
        new ChangeGoalSummary({
          goalId,
          summary: 'Another summary',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-summary-missing-key',
        })
      )
    ).rejects.toThrow();
  });

  it('does not publish when repository save fails', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate);
    repo.failNextSave();

    await expect(
      handler.handleChangePriority(
        new ChangeGoalPriority({
          goalId,
          priority: 'should',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-priority-fail',
        })
      )
    ).rejects.toThrow();
  });

  it('surfaces concurrency errors from repository', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate);
    repo.failWith(new ConcurrencyError());

    await expect(
      handler.handleChangeSlice(
        new ChangeGoalSlice({
          goalId,
          slice: 'Work',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-slice-concurrency',
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('changes target month', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await expect(
      handler.handleChangeTargetMonth(
        new ChangeGoalTargetMonth({
          goalId,
          targetMonth: '2026-01',
          actorId,
          timestamp: Date.now(),
          knownVersion: 1,
          idempotencyKey: 'idem-target-month',
        })
      )
    ).resolves.toBeDefined();
  });

  it('throws ConcurrencyError when knownVersion mismatches', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate);

    await expect(
      handler.handleChangeSummary(
        new ChangeGoalSummary({
          goalId,
          summary: 'Run a faster marathon',
          actorId,
          timestamp: Date.now(),
          knownVersion: 0,
          idempotencyKey: 'idem-summary-mismatch',
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
