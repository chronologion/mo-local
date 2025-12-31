import { IEvent } from './IEvent';
import { ActorId } from './vos/ActorId';
import { AggregateId } from './vos/AggregateId';
import { CorrelationId } from './vos/CorrelationId';
import { EventId } from './vos/EventId';
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
export abstract class DomainEvent<
  TId extends AggregateId = AggregateId,
> implements IEvent<TId> {
  abstract readonly eventType: string;

  readonly aggregateId: TId;
  readonly occurredAt: Timestamp;
  readonly eventId: EventId;
  readonly actorId: ActorId;
  readonly causationId?: EventId;
  readonly correlationId?: CorrelationId;
  readonly version?: number;

  constructor(meta: EventMetadata<TId>) {
    this.aggregateId = meta.aggregateId;
    this.occurredAt = meta.occurredAt;
    this.eventId = meta.eventId;
    this.actorId = meta.actorId;
    this.causationId = meta.causationId;
    this.correlationId = meta.correlationId;
    this.version = meta.version;
  }
}

export type EventMetadata<TId extends AggregateId = AggregateId> = Readonly<{
  aggregateId: TId;
  occurredAt: Timestamp;
  eventId: EventId;
  actorId: ActorId;
  causationId?: EventId;
  correlationId?: CorrelationId;
  version?: number;
}>;
