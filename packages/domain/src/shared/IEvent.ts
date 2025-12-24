import type { ActorId } from './vos/ActorId';
import type { AggregateId } from './vos/AggregateId';
import type { CorrelationId } from './vos/CorrelationId';
import type { EventId } from './vos/EventId';
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
export interface IEvent<TId extends AggregateId = AggregateId> {
  /** Unique ID for this event */
  eventId: EventId;

  /** The ID of the aggregate this event belongs to */
  aggregateId: TId;

  /** When this event occurred (domain-level timestamp value object) */
  occurredAt: Timestamp;

  /** Actor responsible for this event */
  actorId: ActorId;

  /** What event caused this event, if any */
  causationId?: EventId;

  /** Correlation identifier for tracing workflows */
  correlationId?: CorrelationId;
}
