import {
  ValidatedRegisterUserCommand,
  ValidatedImportUserKeysCommand,
} from './commands';
import { KeyStorePort, EventBusPort } from '../ports';
import { EventId, Timestamp, UserRegistered } from '@mo/domain';

/**
 * Handles user onboarding and key import flows.
 */
export class UserCommandHandler {
  constructor(
    private readonly keyStore: KeyStorePort,
    private readonly eventBus: EventBusPort
  ) {}

  async handleRegister(
    command: ValidatedRegisterUserCommand
  ): Promise<{ userId: string }> {
    const actorId = command.actorId;
    const registeredAt = Timestamp.fromMillis(command.timestamp);
    const registrationEvent = new UserRegistered(
      {
        userId: actorId,
        registeredAt,
      },
      {
        aggregateId: actorId,
        occurredAt: registeredAt,
        eventId: EventId.create(),
        actorId,
      }
    );
    await this.eventBus.publish([registrationEvent]);
    return { userId: actorId.value };
  }

  async handleImportKeys(
    command: ValidatedImportUserKeysCommand
  ): Promise<{ userId: string }> {
    await this.keyStore.importKeys(command.backup);
    return { userId: command.actorId.value };
  }
}
