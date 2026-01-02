import { describe, expect, it } from 'vitest';
import { ChangeGoalSummary, CreateGoal, type CreateGoalPayload, GrantGoalAccess } from '../../../src/goals/commands';
import { GoalCommandHandler } from '../../../src/goals/GoalCommandHandler';
import {
  InMemoryGoalRepository,
  InMemoryIdempotencyStore,
  InMemoryKeyStore,
  MockCryptoService,
} from '../../fixtures/ports';
import { ValidationException } from '../../../src/errors/ValidationError';

const now = Date.now();
const goalId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001';
const actorId = 'user-1';

const makeHandler = () =>
  new GoalCommandHandler(
    new InMemoryGoalRepository(),
    new InMemoryKeyStore(),
    new MockCryptoService(),
    new InMemoryIdempotencyStore()
  );

const createGoalPayload: CreateGoalPayload = {
  goalId,
  slice: 'Health' as const,
  summary: 'Run a marathon',
  targetMonth: '2025-12',
  priority: 'must' as const,
  timestamp: now,
};
const createGoal = () => new CreateGoal(createGoalPayload, { actorId, idempotencyKey: 'idem-create' });

describe('CreateGoal', () => {
  it('is a lean DTO with assigned payload', () => {
    const cmd = new CreateGoal(
      {
        goalId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f001',
        slice: 'Health',
        summary: 'Run a marathon',
        targetMonth: '2025-12',
        priority: 'must',
        timestamp: now,
      },
      { actorId: 'user-1', idempotencyKey: 'idem-create-lean' }
    );

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
        new ChangeGoalSummary(
          {
            goalId,
            summary: '',
            timestamp: now,
            knownVersion: 1,
          },
          { actorId, idempotencyKey: 'idem-summary-invalid' }
        )
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('rejects invalid permission', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createGoal());

    await expect(
      handler.handleGrantAccess(
        new GrantGoalAccess(
          {
            goalId,
            grantToUserId: 'user-2',
            permission: 'owner' as never,
            timestamp: now,
            knownVersion: 1,
          },
          { actorId, idempotencyKey: 'idem-grant-invalid' }
        )
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });
});
