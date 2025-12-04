import { Entity } from './Entity';
import { DomainEvent } from './DomainEvent';

/**
 * Base class for aggregate roots.
 *
 * Aggregate roots are the entry points for commands and the source of domain events.
 * They maintain consistency boundaries and enforce business invariants.
 *
 * This implementation uses event sourcing: state changes are captured as events,
 * and the aggregate can be reconstructed by replaying those events.
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _uncommittedEvents: DomainEvent[] = [];
  private _version = 0;

  /**
   * Apply a domain event to this aggregate.
   *
   * This method:
   * 1. Adds the event to the uncommitted events list
   * 2. Calls the appropriate event handler to update internal state
   * 3. Increments the version
   */
  protected apply(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
    this.applyEvent(event);
    this._version++;
  }

  /**
   * Route the event to the appropriate handler method.
   *
   * By convention, event handlers are named `on{EventType}`.
   * For example, GoalCreated → onGoalCreated(event)
   */
  private applyEvent(event: DomainEvent): void {
    const handlerName = `on${event.eventType}` as keyof this;
    const handler = this[handlerName];

    if (typeof handler === 'function') {
      (handler as Function).call(this, event);
    } else {
      throw new Error(
        `No handler found for event type '${event.eventType}' on ${this.constructor.name}. ` +
          `Expected method: ${String(handlerName)}`
      );
    }
  }

  /**
   * Get all events that have been applied since the last commit.
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Mark all uncommitted events as committed.
   *
   * Called by the event store after successfully persisting events.
   */
  markEventsAsCommitted(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Load the aggregate from a history of events.
   *
   * Used for event sourcing: replaying events to reconstruct state.
   */
  loadFromHistory(events: DomainEvent[]): void {
    events.forEach((event) => {
      this.applyEvent(event);
      this._version++;
    });
  }

  /**
   * Restore the aggregate version from a persisted snapshot.
   */
  protected restoreVersion(version: number): void {
    this._version = version;
  }

  get version(): number {
    return this._version;
  }
}
