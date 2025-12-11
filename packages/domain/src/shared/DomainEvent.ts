import type { AggregateId } from './vos/AggregateId';
import type { Timestamp } from './vos/Timestamp';

/**
 * Base interface for all domain events.
 *
 * Domain events are immutable facts that represent something that happened
 * in the domain. They are the source of truth in our event-sourced system.
 *
 * The domain sees only rich value objects here:
 * - `aggregateId` is an AggregateId (e.g. GoalId, ProjectId)
 * - `occurredAt` is a Timestamp value object
 */
export interface DomainEvent<TId extends AggregateId = AggregateId> {
  /** The type of event (e.g., 'GoalCreated', 'GoalSummaryChanged') */
  readonly eventType: string;

  /** The ID of the aggregate this event belongs to */
  get aggregateId(): TId;

  /** When this event occurred (domain-level timestamp value object) */
  get occurredAt(): Timestamp;
}
