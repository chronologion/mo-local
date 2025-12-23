import {
  ValidatedRegisterUserCommand,
  ValidatedImportUserKeysCommand,
} from './commands';
import { IKeyStore, IEventBus } from '../ports';
import { DomainEvent, Timestamp } from '@mo/domain';

/**
 * Handles user onboarding and key import flows.
 */
export class UserCommandHandler {
  constructor(
    private readonly keyStore: IKeyStore,
    private readonly eventBus: IEventBus
  ) {}

  async handleRegister(
    command: ValidatedRegisterUserCommand
  ): Promise<{ userId: string }> {
    const registrationEvent: DomainEvent = {
      eventType: 'UserRegistered',
      get aggregateId() {
        return command.userId;
      },
      get occurredAt() {
        return Timestamp.fromMillis(command.timestamp);
      },
    };
    await this.eventBus.publish([registrationEvent]);
    return { userId: command.userId.value };
  }

  async handleImportKeys(
    command: ValidatedImportUserKeysCommand
  ): Promise<{ userId: string }> {
    await this.keyStore.importKeys(command.backup);
    return { userId: command.userId.value };
  }
}
