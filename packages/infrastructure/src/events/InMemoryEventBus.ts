import { type EventBusPort, type EventHandler } from '@mo/application';
import { DomainEvent } from '@mo/domain';

/**
 * Simple in-memory event bus implementation for browser/runtime wiring.
 */
export class InMemoryEventBus implements EventBusPort {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly warnThresholdMs = 50;

  private now(): number {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }
    return Date.now();
  }

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const listeners = this.handlers.get(event.eventType) ?? [];
      const start = this.now();
      const timings: Array<{ name: string; durationMs: number }> = [];
      await Promise.all(
        listeners.map(async (handler, index) => {
          const handlerStart = this.now();
          await handler(event);
          const handlerEnd = this.now();
          timings.push({
            name: handler.name || `handler_${index}`,
            durationMs: handlerEnd - handlerStart,
          });
        })
      );
      const totalMs = this.now() - start;
      if (totalMs > this.warnThresholdMs) {
        console.warn(`[EventBus] publish exceeded budget`, {
          eventType: event.eventType,
          durationMs: totalMs,
          budgetMs: this.warnThresholdMs,
          handlers: timings
            .sort((a, b) => b.durationMs - a.durationMs)
            .map((item) => ({
              name: item.name,
              durationMs: item.durationMs,
            })),
        });
      }
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }
}
