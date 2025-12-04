export type QueryEnvelope = { type: string };

export class QueryBus<TResult> {
  private readonly handlers = new Map<string, (query: QueryEnvelope) => Promise<TResult>>();

  register<TQuery extends QueryEnvelope>(
    type: TQuery['type'],
    handler: (query: TQuery) => Promise<TResult>
  ): void {
    this.handlers.set(type, handler as (query: QueryEnvelope) => Promise<TResult>);
  }

  async dispatch<TQuery extends QueryEnvelope>(query: TQuery): Promise<TResult> {
    const handler = this.handlers.get(query.type);
    if (!handler) {
      throw new Error(`No handler registered for query type ${query.type}`);
    }
    return handler(query);
  }
}
