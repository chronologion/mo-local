import { ICommand } from './cqrsTypes';

export type CommandMetadata = Readonly<{
  actorId: string;
  idempotencyKey: string;
  correlationId?: string | null;
  causationId?: string | null;
}>;

/**
 * Minimal base command with optional metadata.
 */
export abstract class BaseCommand<TPayload extends object> implements ICommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;

  protected constructor(_payload: Partial<TPayload> = {}, meta?: CommandMetadata) {
    // Subclasses assign payload fields explicitly to keep commands strict.
    if (!meta?.actorId) {
      throw new Error('Command requires actorId');
    }
    if (!meta?.idempotencyKey) {
      throw new Error('Command requires idempotencyKey');
    }
    this.actorId = meta.actorId;
    this.idempotencyKey = meta.idempotencyKey;
    this.correlationId = meta?.correlationId;
    this.causationId = meta?.causationId;
  }
}
