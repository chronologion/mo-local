import { describe, expect, it } from 'vitest';
import { GoalCommandHandler } from '../../../src/goals/handlers/GoalCommandHandler';
import { GoalApplicationService } from '../../../src/goals/services/GoalApplicationService';
import {
  InMemoryEventBus,
  InMemoryGoalRepository,
  InMemoryKeyStore,
  MockCryptoService,
} from '../../../src/ports/mocks';
import { ConcurrencyError } from '../../../src/errors/ConcurrencyError';

const goalId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f101';
const userId = 'user-1';
const baseCreate = {
  type: 'CreateGoal' as const,
  goalId,
  slice: 'Health' as const,
  summary: 'Run a marathon',
  targetMonth: '2025-12',
  priority: 'must' as const,
  userId,
  timestamp: Date.now(),
};

const setup = () => {
  const repo = new InMemoryGoalRepository();
  const eventBus = new InMemoryEventBus();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const handler = new GoalCommandHandler(repo, keyStore, crypto, eventBus);
  const app = new GoalApplicationService(handler);
  return { repo, eventBus, keyStore, crypto, app };
};

describe('GoalCommandHandler + GoalApplicationService', () => {
  it('creates a goal and stores aggregate key', async () => {
    const { app, keyStore, eventBus } = setup();

    const result = await app.handle(baseCreate);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.goalId).toBe(goalId);
      const storedKey = await keyStore.getAggregateKey(goalId);
      expect(storedKey).toBeInstanceOf(Uint8Array);
      expect(eventBus.getPublished().length).toBeGreaterThan(0);
    }
  });

  it('updates summary and publishes event', async () => {
    const { app, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;

    const result = await app.handle({
      type: 'ChangeGoalSummary',
      goalId,
      summary: 'Run a faster marathon',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(true);
    expect(eventBus.getPublished().length).toBeGreaterThan(before);
  });

  it('fails when aggregate key missing', async () => {
    const { app, keyStore } = setup();
    await app.handle(baseCreate);
    keyStore.removeAggregateKey(goalId);

    const result = await app.handle({
      type: 'ChangeGoalSummary',
      goalId,
      summary: 'Another summary',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
  });

  it('does not publish when repository save fails', async () => {
    const { app, repo, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;
    repo.failNextSave();

    const result = await app.handle({
      type: 'ChangeGoalPriority',
      goalId,
      priority: 'should',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(eventBus.getPublished().length).toBe(before);
  });

  it('surfaces concurrency errors from repository', async () => {
    const { app, repo } = setup();
    await app.handle(baseCreate);
    repo.failWith(new ConcurrencyError());

    const result = await app.handle({
      type: 'ChangeGoalSlice',
      goalId,
      slice: 'Work',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
  });

  it('fails when event bus publish fails', async () => {
    const { app, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;
    eventBus.failNext(new Error('publish failed'));

    const result = await app.handle({
      type: 'ChangeGoalPriority',
      goalId,
      priority: 'should',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(eventBus.getPublished().length).toBe(before);
  });
});
