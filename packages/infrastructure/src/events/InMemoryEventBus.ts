import { type EventBusPort, type EventHandler } from '@mo/application';
import { DomainEvent } from '@mo/domain';

/**
 * Simple in-memory event bus implementation for browser/runtime wiring.
 */
export class InMemoryEventBus implements EventBusPort {
  private readonly handlers = new Map<string, EventHandler[]>();

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const listeners = this.handlers.get(event.eventType) ?? [];
      await Promise.all(listeners.map((handler) => handler(event)));
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }
}
