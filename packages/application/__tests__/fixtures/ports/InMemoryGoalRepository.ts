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
  private failSave = false;
  private errorToThrow: Error | null = null;

  async findById(id: GoalId): Promise<Goal | null> {
    return this.store.get(id.value)?.goal ?? null;
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    if (this.errorToThrow) {
      const error = this.errorToThrow;
      this.errorToThrow = null;
      throw error;
    }
    if (this.failSave) {
      this.failSave = false;
      throw new Error('save failed');
    }
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

  failNextSave(): void {
    this.failSave = true;
  }

  failWith(error: Error): void {
    this.errorToThrow = error;
  }
}
