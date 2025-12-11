import { ICommand } from './cqrsTypes';

/**
 * Minimal base command that copies payload onto the instance.
 * Keeps commands lean and immutable after construction.
 */
export abstract class BaseCommand<TPayload extends object> implements ICommand {
  abstract readonly type: string;

  protected constructor(payload: Partial<TPayload> = {}) {
    Object.assign(this, payload);
  }
}
