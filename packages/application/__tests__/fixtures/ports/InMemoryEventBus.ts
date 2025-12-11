import { DomainEvent } from '@mo/domain';
import { IEventBus } from '../IEventBus';
import { EventHandler } from '../types';

/**
 * In-process pub/sub for tests.
 */
export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly published: DomainEvent[] = [];
  private failNextWith: Error | null = null;

  subscribe(eventType: string, handler: EventHandler): void {
    const current = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...current, handler]);
  }

  async publish(events: DomainEvent[]): Promise<void> {
    if (this.failNextWith) {
      const error = this.failNextWith;
      this.failNextWith = null;
      throw error;
    }

    for (const event of events) {
      this.published.push(event);
      const subs = this.handlers.get(event.eventType) ?? [];
      for (const handler of subs) {
        await handler(event);
      }
    }
  }

  getPublished(): DomainEvent[] {
    return this.published;
  }

  failNext(error: Error): void {
    this.failNextWith = error;
  }
}
