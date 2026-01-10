import type { SessionId } from '@mo/key-service-web';
import { enrollUserPresenceUnlock, type UserPresenceEnrollOptions } from '@mo/key-service-web';
import { getWebAuthnRpId } from '../../utils/webauthn';

type EnrollPasskeyParams = {
  sessionId: SessionId;
  userId: string;
  passphraseUtf8: Uint8Array;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestKeyService: any;
};

/**
 * Enroll a passkey for the current user if not already enabled.
 * Performs step-up authentication, retrieves PRF salt, enrolls the passkey,
 * and stores the credential in the key service.
 *
 * @throws Error if enrollment fails (caller should handle gracefully)
 */
export const enrollPasskeyIfRequested = async ({
  sessionId,
  userId,
  passphraseUtf8,
  requestKeyService,
}: EnrollPasskeyParams): Promise<void> => {
  // Step-up before enabling
  await requestKeyService({
    type: 'stepUp',
    payload: { sessionId, passphraseUtf8 },
  });

  // Get PRF salt
  const prfInfo = await requestKeyService({
    type: 'getUserPresenceUnlockInfo',
    payload: {},
  });

  if (!prfInfo.enabled) {
    // Enroll the passkey
    const enrollOptions: UserPresenceEnrollOptions = {
      rpName: 'Mo Local',
      rpId: getWebAuthnRpId(),
      userId: new TextEncoder().encode(userId),
      userName: userId,
      userDisplayName: `User ${userId.slice(0, 8)}`,
      prfSalt: prfInfo.prfSalt,
      timeoutMs: 60_000,
    };

    const { credentialId, userPresenceSecret } = await enrollUserPresenceUnlock(enrollOptions);

    // Store in key service
    await requestKeyService({
      type: 'enableUserPresenceUnlock',
      payload: {
        sessionId,
        credentialId,
        userPresenceSecret,
      },
    });
  }
};
