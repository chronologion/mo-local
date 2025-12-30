import { ICommand } from './cqrsTypes';

export type CommandMetadata = Readonly<{
  correlationId?: string | null;
  causationId?: string | null;
}>;

/**
 * Minimal base command that copies payload onto the instance.
 * Keeps commands lean and immutable after construction.
 */
export abstract class BaseCommand<TPayload extends object> implements ICommand {
  abstract readonly type: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;

  protected constructor(
    payload: Partial<TPayload> = {},
    meta?: CommandMetadata
  ) {
    Object.assign(this, payload);
    this.correlationId = meta?.correlationId;
    this.causationId = meta?.causationId;
  }
}
