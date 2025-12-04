export type CommandEnvelope = { type: string };

export class CommandBus<TResult> {
  private readonly handlers = new Map<string, (command: CommandEnvelope) => Promise<TResult>>();

  register<TCommand extends CommandEnvelope>(
    type: TCommand['type'],
    handler: (command: TCommand) => Promise<TResult>
  ): void {
    this.handlers.set(type, handler as (command: CommandEnvelope) => Promise<TResult>);
  }

  async dispatch<TCommand extends CommandEnvelope>(command: TCommand): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(`No handler registered for command type ${command.type}`);
    }
    return handler(command);
  }
}
