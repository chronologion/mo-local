import { ICommand } from './cqrsTypes';

export type CommandMetadata = Readonly<{
  actorId: string;
  correlationId?: string | null;
  causationId?: string | null;
}>;

/**
 * Minimal base command with optional metadata.
 */
export abstract class BaseCommand<TPayload extends object> implements ICommand {
  abstract readonly type: string;
  readonly actorId: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;

  protected constructor(
    _payload: Partial<TPayload> = {},
    meta?: CommandMetadata
  ) {
    // Subclasses assign payload fields explicitly to keep commands strict.
    if (!meta?.actorId) {
      throw new Error('Command requires actorId');
    }
    this.actorId = meta.actorId;
    this.correlationId = meta?.correlationId;
    this.causationId = meta?.causationId;
  }
}
