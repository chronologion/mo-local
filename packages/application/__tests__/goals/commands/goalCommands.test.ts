import { describe, expect, it } from 'vitest';
import {
  ChangeGoalSummary,
  CreateGoal,
  GrantGoalAccess,
} from '../../../src/goals/commands';
import { GoalCommandHandler } from '../../../src/goals/GoalCommandHandler';
import {
  InMemoryEventBus,
  InMemoryGoalRepository,
  InMemoryKeyStore,
  MockCryptoService,
} from '../../fixtures/ports';
import { ValidationException } from '../../../src/errors/ValidationError';

const now = Date.now();
const goalId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001';
const userId = 'user-1';

const makeHandler = () =>
  new GoalCommandHandler(
    new InMemoryGoalRepository(),
    new InMemoryKeyStore(),
    new MockCryptoService(),
    new InMemoryEventBus()
  );

const createGoal = () =>
  new CreateGoal({
    goalId,
    slice: 'Health',
    summary: 'Run a marathon',
    targetMonth: '2025-12',
    priority: 'must',
    userId,
    timestamp: now,
  });

describe('CreateGoal', () => {
  it('is a lean DTO with assigned payload', () => {
    const cmd = new CreateGoal({
      goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001',
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      userId: 'user-1',
      timestamp: now,
    });

    expect(cmd.type).toBe('CreateGoal');
    expect(cmd.goalId).toBe('018f7b1a-7c8a-72c4-a0ab-8234c2d6f001');
    expect(cmd.slice).toBe('Health');
    expect(cmd.priority).toBe('must');
  });
});

describe('Goal command validation inside handler', () => {
  it('rejects empty summary', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createGoal());

    await expect(
      handler.handleChangeSummary(
        new ChangeGoalSummary({
          goalId,
          summary: '',
          userId,
          timestamp: now,
        })
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('rejects invalid permission', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createGoal());

    await expect(
      handler.handleGrantAccess(
        new GrantGoalAccess({
          goalId,
          grantToUserId: 'user-2',
          permission: 'owner' as never,
          userId,
          timestamp: now,
        })
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });
});
