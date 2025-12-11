export interface ICommand<TType extends string = string> {
  readonly type: TType;
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
