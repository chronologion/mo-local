/**
 * Base interface for all domain events.
 *
 * Domain events are immutable facts that represent something that happened
 * in the domain. They are the source of truth in our event-sourced system.
 */
export interface DomainEvent {
  /** The type of event (e.g., 'GoalCreated', 'GoalSummaryChanged') */
  readonly eventType: string;

  /** When this event occurred */
  readonly occurredAt: Date;

  /** The ID of the aggregate this event belongs to */
  readonly aggregateId: string;
}
