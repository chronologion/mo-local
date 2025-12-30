export interface ICommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;
}

export interface IQuery<TType extends string = string> {
  readonly type: TType;
}

export interface ICommandHandler<TCommand extends ICommand, TResult> {
  handle(command: TCommand): Promise<TResult>;
}

export interface IQueryHandler<TQuery extends IQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
