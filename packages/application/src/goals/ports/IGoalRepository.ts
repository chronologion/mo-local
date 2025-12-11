import { Goal, GoalId } from '@mo/domain';
import type { Repository } from '../../shared/ports/Repository';

/**
 * Persistence boundary for Goal aggregates.
 *
 * Implementations are responsible for serializing domain events, handling
 * optimistic concurrency, and applying the provided encryption key where
 * necessary.
 */
export interface IGoalRepository extends Repository<Goal, GoalId> {
  archive(id: GoalId): Promise<void>;
}
