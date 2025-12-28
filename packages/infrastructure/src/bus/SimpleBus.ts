import type { BusEnvelope, BusPort } from '@mo/application';

export class SimpleBus<
  TEnvelope extends BusEnvelope,
  TResult,
> implements BusPort<TEnvelope, TResult> {
  private readonly handlers = new Map<
    string,
    (message: TEnvelope) => Promise<TResult>
  >();

  register<TMessage extends TEnvelope>(
    type: TMessage['type'],
    handler: (message: TMessage) => Promise<TResult>
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for type ${type}`);
    }
    this.handlers.set(
      type,
      handler as (message: TEnvelope) => Promise<TResult>
    );
  }

  async dispatch<TMessage extends TEnvelope>(
    message: TMessage
  ): Promise<TResult> {
    const handler = this.handlers.get(message.type);
    if (!handler) {
      throw new Error(`No handler registered for type ${message.type}`);
    }
    return handler(message);
  }
}
