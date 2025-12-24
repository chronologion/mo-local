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
  readonly actorId?: ActorId;
  readonly causationId?: EventId;
  readonly correlationId?: CorrelationId;

  constructor(params: {
    aggregateId: TId;
    occurredAt: Timestamp;
    eventId?: EventId;
    actorId?: ActorId;
    causationId?: EventId;
    correlationId?: CorrelationId;
  }) {
    this.aggregateId = params.aggregateId;
    this.occurredAt = params.occurredAt;
    this.eventId = params.eventId ?? EventId.create();
    this.actorId = params.actorId;
    this.causationId = params.causationId;
    this.correlationId = params.correlationId;
  }
}

export type EventMetadata = Readonly<{
  eventId?: EventId;
  actorId?: ActorId;
  causationId?: EventId;
  correlationId?: CorrelationId;
}>;
