import {
  ValidatedRegisterUserCommand,
  ValidatedImportUserKeysCommand,
} from '../commands';
import { IKeyStore, IEventBus } from '../ports';

/**
 * Handles user onboarding and key import flows.
 */
export class UserCommandHandler {
  constructor(private readonly keyStore: IKeyStore, private readonly eventBus: IEventBus) {}

  async handleRegister(command: ValidatedRegisterUserCommand): Promise<{ userId: string }> {
    // For the POC we publish a registration event for downstream infrastructure.
    await this.eventBus.publish([
      {
        eventType: 'UserRegistered',
        aggregateId: command.userId.value,
        occurredAt: command.timestamp,
      },
    ]);
    return { userId: command.userId.value };
  }

  async handleImportKeys(command: ValidatedImportUserKeysCommand): Promise<{ userId: string }> {
    await this.keyStore.importKeys(command.backup);
    return { userId: command.userId.value };
  }
}
