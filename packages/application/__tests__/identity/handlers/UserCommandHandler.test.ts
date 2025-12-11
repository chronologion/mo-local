import { describe, expect, it } from 'vitest';
import { UserId } from '@mo/domain';
import { InMemoryEventBus, InMemoryKeyStore } from '../../fixtures/ports';
import { UserCommandHandler } from '../../../src/identity/handlers/UserCommandHandler';

describe('UserCommandHandler', () => {
  it('publishes registration event', async () => {
    const bus = new InMemoryEventBus();
    const keyStore = new InMemoryKeyStore();
    const handler = new UserCommandHandler(keyStore, bus);

    await handler.handleRegister({
      type: 'RegisterUser',
      userId: UserId.of('user-1'),
      signingPublicKey: new Uint8Array([1]),
      encryptionPublicKey: new Uint8Array([2]),
      timestamp: new Date(),
    });

    expect(
      bus.getPublished().some((e) => e.eventType === 'UserRegistered')
    ).toBe(true);
  });

  it('imports keys', async () => {
    const bus = new InMemoryEventBus();
    const keyStore = new InMemoryKeyStore();
    const handler = new UserCommandHandler(keyStore, bus);

    await handler.handleImportKeys({
      type: 'ImportUserKeys',
      userId: UserId.of('user-1'),
      backup: {
        identityKeys: {
          signingPrivateKey: new Uint8Array([1]),
          signingPublicKey: new Uint8Array([2]),
          encryptionPrivateKey: new Uint8Array([3]),
          encryptionPublicKey: new Uint8Array([4]),
        },
        aggregateKeys: {},
      },
      timestamp: new Date(),
    });

    const stored = await keyStore.exportKeys();
    expect(stored.identityKeys.signingPrivateKey.length).toBe(1);
  });
});
