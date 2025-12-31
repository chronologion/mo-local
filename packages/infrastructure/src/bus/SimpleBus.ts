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
    name: string,
    handler: (message: TMessage) => Promise<TResult>
  ): void {
    if (this.handlers.has(name)) {
      throw new Error(`Handler already registered for name ${name}`);
    }
    this.handlers.set(
      name,
      handler as (message: TEnvelope) => Promise<TResult>
    );
  }

  async dispatch<TMessage extends TEnvelope>(
    message: TMessage
  ): Promise<TResult> {
    const envelope = message as {
      type?: string;
      constructor: { name: string };
    };
    const name = envelope.type ?? envelope.constructor.name;
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for name ${name}`);
    }
    return handler(message);
  }
}
