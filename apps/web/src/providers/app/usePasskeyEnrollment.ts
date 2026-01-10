import { useCallback, useState } from 'react';
import { enrollUserPresenceUnlock, isUserPresenceSupported, type UserPresenceEnrollOptions } from '@mo/key-service-web';
import type { SessionId } from '@mo/key-service-web';
import type { KeyServiceRequester } from './keyServiceFlows';
import { safeZeroize } from './keyServiceFlows';

type UsePasskeyEnrollmentParams = {
  userId: string;
  sessionId: SessionId | null;
  requestKeyService: KeyServiceRequester;
};

type UsePasskeyEnrollmentReturn = {
  isPasskeySupported: boolean;
  enrollPasskey: (passphrase: string) => Promise<void>;
  isPasskeyEnabled: boolean;
  checkPasskeyEnabled: () => Promise<void>;
};

export function usePasskeyEnrollment({
  userId,
  sessionId,
  requestKeyService,
}: UsePasskeyEnrollmentParams): UsePasskeyEnrollmentReturn {
  const [isPasskeyEnabled, setIsPasskeyEnabled] = useState(false);

  const checkPasskeyEnabled = useCallback(async () => {
    if (!sessionId) {
      setIsPasskeyEnabled(false);
      return;
    }
    try {
      const info = await requestKeyService({
        type: 'getUserPresenceUnlockInfo',
        payload: {},
      });
      setIsPasskeyEnabled(info.payload.enabled);
    } catch {
      setIsPasskeyEnabled(false);
    }
  }, [sessionId, requestKeyService]);

  const enrollPasskey = useCallback(
    async (passphrase: string) => {
      if (!sessionId) {
        throw new Error('No active session. Please unlock first.');
      }

      if (!isUserPresenceSupported()) {
        throw new Error('Passkeys are not supported in this browser or device.');
      }

      const passphraseUtf8 = new TextEncoder().encode(passphrase);

      try {
        // Step-up authentication required before enabling new auth method
        await requestKeyService({
          type: 'stepUp',
          payload: {
            sessionId,
            passphraseUtf8,
          },
        });

        // Get PRF salt from key service
        const prfInfo = await requestKeyService({
          type: 'getUserPresenceUnlockInfo',
          payload: {},
        });

        if (prfInfo.payload.enabled) {
          throw new Error('Passkey is already enabled.');
        }

        const prfSalt = prfInfo.payload.prfSalt;

        // Enroll the passkey using WebAuthn PRF
        const enrollOptions: UserPresenceEnrollOptions = {
          rpName: 'Mo Local',
          rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
          userId: new TextEncoder().encode(userId),
          userName: userId,
          userDisplayName: `User ${userId.slice(0, 8)}`,
          prfSalt,
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

        setIsPasskeyEnabled(true);
      } finally {
        // Always zeroize the passphrase
        safeZeroize(passphraseUtf8);
      }
    },
    [userId, sessionId, requestKeyService]
  );

  return {
    isPasskeySupported: isUserPresenceSupported(),
    enrollPasskey,
    isPasskeyEnabled,
    checkPasskeyEnabled,
  };
}
