export type BusEnvelope = { type: string };

export interface BusPort<TEnvelope extends BusEnvelope, TResult> {
  register<TMessage extends TEnvelope>(
    type: TMessage['type'],
    handler: (message: TMessage) => Promise<TResult>
  ): void;

  dispatch<TMessage extends TEnvelope>(message: TMessage): Promise<TResult>;
}
