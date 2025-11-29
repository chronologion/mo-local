import { DomainEvent } from '@mo/domain';
import { IEventBus } from '../IEventBus';
import { EventHandler } from '../types';

/**
 * In-process pub/sub for tests.
 */
export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const current = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...current, handler]);
  }

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const subs = this.handlers.get(event.eventType) ?? [];
      for (const handler of subs) {
        await handler(event);
      }
    }
  }
}
