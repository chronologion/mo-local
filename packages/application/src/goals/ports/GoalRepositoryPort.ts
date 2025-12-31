import { Goal, GoalId, Timestamp, UserId } from '@mo/domain';
import type { Repository } from '../../shared/ports/Repository';

/**
 * Persistence boundary for Goal aggregates.
 *
 * Implementations are responsible for serializing domain events, handling
 * optimistic concurrency, and applying the provided encryption key where
 * necessary.
 */
export interface GoalRepositoryPort extends Repository<Goal, GoalId> {
  archive(id: GoalId, archivedAt: Timestamp, actorId: UserId): Promise<void>;
}
