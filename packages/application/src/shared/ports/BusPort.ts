export type BusEnvelope = object;

export interface BusPort<TEnvelope extends BusEnvelope, TResult> {
  register<TMessage extends TEnvelope>(
    name: string,
    handler: (message: TMessage) => Promise<TResult>
  ): void;

  dispatch<TMessage extends TEnvelope>(message: TMessage): Promise<TResult>;
}
