import { DomainEvent } from '@mo/domain';
import { EventHandler } from './types';

/**
 * Lightweight in-process event bus abstraction.
 */
export interface EventBusPort {
  publish(events: DomainEvent[]): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
}
