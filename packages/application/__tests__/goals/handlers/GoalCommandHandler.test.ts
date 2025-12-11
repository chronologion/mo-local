import { describe, expect, it } from 'vitest';
import { GoalCommandHandler } from '../../../src/goals/GoalCommandHandler';
import {
  InMemoryEventBus,
  InMemoryGoalRepository,
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
} from '../../../src/goals/commands';

const goalId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f101';
const userId = 'user-1';
const baseCreate = new CreateGoal({
  goalId,
  slice: 'Health' as const,
  summary: 'Run a marathon',
  targetMonth: '2025-12',
  priority: 'must' as const,
  userId,
  timestamp: Date.now(),
});

const setup = () => {
  const repo = new InMemoryGoalRepository();
  const eventBus = new InMemoryEventBus();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const handler = new GoalCommandHandler(repo, keyStore, crypto, eventBus);
  return { repo, eventBus, keyStore, crypto, handler };
};

describe('GoalCommandHandler', () => {
  it('creates a goal and stores aggregate key', async () => {
    const { handler, keyStore, eventBus } = setup();

    await handler.handleCreate(baseCreate);

    const storedKey = await keyStore.getAggregateKey(goalId);
    expect(storedKey).toBeInstanceOf(Uint8Array);
    expect(eventBus.getPublished().length).toBeGreaterThan(0);
  });

  it('updates summary and publishes event', async () => {
    const { handler, eventBus } = setup();
    await handler.handleCreate(baseCreate);
    const before = eventBus.getPublished().length;

    await handler.handleChangeSummary(
      new ChangeGoalSummary({
        goalId,
        summary: 'Run a faster marathon',
        userId,
        timestamp: Date.now(),
      })
    );
    expect(eventBus.getPublished().length).toBeGreaterThan(before);
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
          userId,
          timestamp: Date.now(),
        })
      )
    ).rejects.toThrow();
  });

  it('does not publish when repository save fails', async () => {
    const { handler, repo, eventBus } = setup();
    await handler.handleCreate(baseCreate);
    const before = eventBus.getPublished().length;
    repo.failNextSave();

    await expect(
      handler.handleChangePriority(
        new ChangeGoalPriority({
          goalId,
          priority: 'should',
          userId,
          timestamp: Date.now(),
        })
      )
    ).rejects.toThrow();
    expect(eventBus.getPublished().length).toBe(before);
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
          userId,
          timestamp: Date.now(),
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('fails when event bus publish fails', async () => {
    const { handler, eventBus } = setup();
    await handler.handleCreate(baseCreate);
    const before = eventBus.getPublished().length;
    eventBus.failNext(new Error('publish failed'));

    await expect(
      handler.handleChangeTargetMonth(
        new ChangeGoalTargetMonth({
          goalId,
          targetMonth: '2026-01',
          userId,
          timestamp: Date.now(),
        })
      )
    ).rejects.toThrow();
    expect(eventBus.getPublished().length).toBe(before);
  });
});
