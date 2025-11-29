import { Goal, GoalId } from '@mo/domain';

/**
 * Persistence boundary for Goal aggregates.
 *
 * Implementations are responsible for serializing domain events, handling
 * optimistic concurrency, and applying the provided encryption key where
 * necessary.
 */
export interface IGoalRepository {
  findById(id: GoalId): Promise<Goal | null>;

  save(goal: Goal, encryptionKey: Uint8Array): Promise<void>;

  delete(id: GoalId): Promise<void>;
}
