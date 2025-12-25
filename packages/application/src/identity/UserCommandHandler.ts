import {
  ValidatedRegisterUserCommand,
  ValidatedImportUserKeysCommand,
} from './commands';
import { IKeyStore, IEventBus } from '../ports';
import { EventId, Timestamp, UserRegistered } from '@mo/domain';

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
    const registrationEvent = new UserRegistered(
      {
        userId: command.userId,
        registeredAt: Timestamp.fromMillis(command.timestamp),
      },
      { eventId: EventId.create(), actorId: command.userId }
    );
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
