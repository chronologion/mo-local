import { uuidv4 } from '@mo/domain';
import type { KdfParams, KeyServiceRequest, KeyServiceResponse, SessionId, UserId } from '@mo/key-service-web';
import { generateRandomSalt } from '@mo/infrastructure/crypto/deriveSalt';
import { createKeyVaultEnvelope, parseKeyVaultEnvelope } from '../../backup/keyVaultEnvelope';
import type { UserMeta } from './localMeta';
import type { Services } from './types';

export type KeyServiceRequestByType<T extends KeyServiceRequest['type']> = Extract<KeyServiceRequest, { type: T }>;
export type KeyServiceResponseByType<T extends KeyServiceResponse['type']> = Extract<KeyServiceResponse, { type: T }>;

export type KeyServiceRequester = <T extends KeyServiceRequest['type']>(
  request: KeyServiceRequestByType<T>
) => Promise<KeyServiceResponseByType<T>>;

export const buildKdfParams = (): KdfParams => {
  return {
    id: 'kdf-1',
    salt: generateRandomSalt(),
    memoryKib: 65_536,
    iterations: 3,
    parallelism: 1,
  };
};

export const randomBytes = (length: number): Uint8Array => {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto unavailable');
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

export const encodePassphrase = (password: string): Uint8Array => new TextEncoder().encode(password);

export const safeZeroize = (bytes: Uint8Array): void => {
  try {
    bytes.fill(0);
  } catch (err) {
    // Ignore detached buffers (transferred to worker).
    if (import.meta.env.DEV) {
      console.debug('[safeZeroize] Failed to zeroize (likely detached buffer):', err);
    }
  }
};

export const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is not supported in this environment');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

export const completeOnboardingFlow = async (params: {
  services: Services;
  storeId: string;
  password: string;
  requestKeyService: KeyServiceRequester;
  toUserId: (value: string) => UserId;
}): Promise<{
  userMeta: UserMeta;
  sessionId: SessionId;
}> => {
  const { services, storeId, password, requestKeyService, toUserId } = params;
  const userId = toUserId(storeId);
  const deviceId = uuidv4();
  const passphraseForCreate = encodePassphrase(password);
  const passphraseForUnlock = encodePassphrase(password);
  try {
    const kdfParams = buildKdfParams();
    await requestKeyService({
      type: 'createVault',
      payload: {
        userId,
        passphraseUtf8: passphraseForCreate,
        kdfParams,
      },
    });
    const unlock = await requestKeyService({
      type: 'unlock',
      payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlock },
    });
    const sessionId = unlock.payload.sessionId;
    const masterKey = randomBytes(32);
    const masterKeyForStore = new Uint8Array(masterKey);
    await requestKeyService({
      type: 'storeAppMasterKey',
      payload: { sessionId, masterKey },
    });
    services.keyStore.setMasterKey(masterKeyForStore);
    safeZeroize(masterKeyForStore);
    safeZeroize(masterKey);

    return {
      userMeta: { userId, deviceId },
      sessionId,
    };
  } finally {
    safeZeroize(passphraseForCreate);
    safeZeroize(passphraseForUnlock);
  }
};

export const unlockFlow = async (params: {
  services: Services;
  password: string;
  requestKeyService: KeyServiceRequester;
}): Promise<SessionId> => {
  const { services, password, requestKeyService } = params;
  const passphraseUtf8 = encodePassphrase(password);
  try {
    const unlockResponse = await requestKeyService({
      type: 'unlock',
      payload: { method: 'passphrase', passphraseUtf8 },
    });
    const master = await requestKeyService({
      type: 'getAppMasterKey',
      payload: { sessionId: unlockResponse.payload.sessionId },
    });
    services.keyStore.setMasterKey(master.payload.masterKey);
    safeZeroize(master.payload.masterKey);
    return unlockResponse.payload.sessionId;
  } finally {
    safeZeroize(passphraseUtf8);
  }
};

export const exportKeyVaultBackupFlow = async (params: {
  sessionId: SessionId;
  password: string;
  sessionUserId?: string;
  requestKeyService: KeyServiceRequester;
}): Promise<string> => {
  const { sessionId, password, sessionUserId, requestKeyService } = params;
  const passphraseUtf8 = encodePassphrase(password);
  try {
    await requestKeyService({
      type: 'stepUp',
      payload: { sessionId, passphraseUtf8 },
    });
    const exportResponse = await requestKeyService({
      type: 'exportKeyVault',
      payload: { sessionId },
    });
    const envelope = createKeyVaultEnvelope({
      cipher: toBase64(exportResponse.payload.blob),
      userId: sessionUserId,
      exportedAt: new Date().toISOString(),
      version: 1,
    });
    return JSON.stringify(envelope, null, 2);
  } finally {
    safeZeroize(passphraseUtf8);
  }
};

export const restoreBackupFlow = async (params: {
  currentStoreId: string | null;
  password: string;
  backup: string;
  db?: Readonly<{
    bytes: Uint8Array;
  }>;
  requestKeyServiceFor: <T extends KeyServiceRequest['type']>(
    targetServices: Services,
    request: KeyServiceRequestByType<T>
  ) => Promise<KeyServiceResponseByType<T>>;
  getTargetServices: (targetUserId: string) => Promise<Services>;
  toUserId: (value: string) => UserId;
}): Promise<{
  targetUserId: string;
  targetServices: Services;
  sessionId: SessionId;
}> => {
  const { currentStoreId, password, backup, db, requestKeyServiceFor, getTargetServices, toUserId } = params;
  const parsedEnvelope = parseKeyVaultEnvelope(backup);
  const cipherB64 = parsedEnvelope.cipher;
  const targetUserId = toUserId(parsedEnvelope.userId ?? currentStoreId ?? uuidv4());
  const vaultBytes = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

  // Validate vault bytes before proceeding
  // Minimum size accounts for nonce (12) + auth tag (16) = 28 bytes minimum for AES-GCM
  if (vaultBytes.length < 28) {
    throw new Error('Invalid backup: vault data too short');
  }
  if (vaultBytes.length > 10 * 1024 * 1024) {
    throw new Error('Invalid backup: vault data exceeds maximum size');
  }

  const targetServices = await getTargetServices(targetUserId);

  // Note: Creating separate passphrase copies for each operation.
  // While this increases memory usage temporarily, it ensures each operation
  // gets a fresh buffer in case any are consumed/transferred.
  const passphraseForCreate = encodePassphrase(password);
  const passphraseForUnlock = encodePassphrase(password);
  const passphraseForStepUp = encodePassphrase(password);
  const passphraseForUnlockAfter = encodePassphrase(password);

  try {
    const kdfParams = buildKdfParams();
    await requestKeyServiceFor(targetServices, {
      type: 'createVault',
      payload: { userId: targetUserId, passphraseUtf8: passphraseForCreate, kdfParams },
    });
    const unlock = await requestKeyServiceFor(targetServices, {
      type: 'unlock',
      payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlock },
    });
    await requestKeyServiceFor(targetServices, {
      type: 'stepUp',
      payload: { sessionId: unlock.payload.sessionId, passphraseUtf8: passphraseForStepUp },
    });
    await requestKeyServiceFor(targetServices, {
      type: 'importKeyVault',
      payload: { sessionId: unlock.payload.sessionId, blob: vaultBytes },
    });
    await requestKeyServiceFor(targetServices, {
      type: 'lock',
      payload: { sessionId: unlock.payload.sessionId },
    });
    const unlockAfter = await requestKeyServiceFor(targetServices, {
      type: 'unlock',
      payload: { method: 'passphrase', passphraseUtf8: passphraseForUnlockAfter },
    });
    const master = await requestKeyServiceFor(targetServices, {
      type: 'getAppMasterKey',
      payload: { sessionId: unlockAfter.payload.sessionId },
    });
    targetServices.keyStore.setMasterKey(master.payload.masterKey);
    safeZeroize(master.payload.masterKey);

    if (db) {
      if (!targetServices.db.importMainDatabase) {
        throw new Error('This build does not support restoring DB files');
      }
      await targetServices.db.importMainDatabase(db.bytes);
    }

    return {
      targetUserId,
      targetServices,
      sessionId: unlockAfter.payload.sessionId,
    };
  } finally {
    safeZeroize(passphraseForCreate);
    safeZeroize(passphraseForUnlock);
    safeZeroize(passphraseForStepUp);
    safeZeroize(passphraseForUnlockAfter);
  }
};
