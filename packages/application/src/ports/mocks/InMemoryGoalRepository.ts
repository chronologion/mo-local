import { Goal, GoalId } from '@mo/domain';
import { IGoalRepository } from '../IGoalRepository';

type StoredGoal = {
  goal: Goal;
  encryptionKey: Uint8Array;
};

/**
 * Simple in-memory repository for tests.
 */
export class InMemoryGoalRepository implements IGoalRepository {
  private readonly store = new Map<string, StoredGoal>();

  async findById(id: GoalId): Promise<Goal | null> {
    return this.store.get(id.value)?.goal ?? null;
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    this.store.set(goal.id.value, { goal, encryptionKey });
  }

  async delete(id: GoalId): Promise<void> {
    this.store.delete(id.value);
  }

  /**
   * Helper for tests to inspect the stored encryption key.
   */
  getStoredKey(id: GoalId): Uint8Array | undefined {
    return this.store.get(id.value)?.encryptionKey;
  }
}
