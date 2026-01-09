export type UserPresenceEnrollOptions = Readonly<{
  rpName: string;
  rpId?: string;
  userId: Uint8Array;
  userName: string;
  userDisplayName: string;
  prfSalt: Uint8Array;
  timeoutMs?: number;
  challenge?: Uint8Array;
}>;

export type UserPresenceSecretOptions = Readonly<{
  credentialId: Uint8Array;
  prfSalt: Uint8Array;
  rpId?: string;
  timeoutMs?: number;
  challenge?: Uint8Array;
}>;

export type UserPresenceEnrollResult = Readonly<{
  credentialId: Uint8Array;
  userPresenceSecret: Uint8Array;
}>;

type PrfEvalInput = Readonly<{
  first: BufferSource;
  second?: BufferSource;
}>;

type PrfExtensionInput = Readonly<{
  eval: PrfEvalInput;
}>;

type PrfExtensionInputs = AuthenticationExtensionsClientInputs & {
  prf?: PrfExtensionInput;
};

type PrfResult = Readonly<{
  enabled?: boolean;
  results?: Readonly<{
    first?: ArrayBuffer;
    second?: ArrayBuffer;
  }>;
  first?: ArrayBuffer;
}>;

type PrfExtensionOutputs = AuthenticationExtensionsClientOutputs & {
  prf?: PrfResult;
};

type PrfCredential = Readonly<{
  rawId: ArrayBuffer;
  getClientExtensionResults: () => AuthenticationExtensionsClientOutputs;
}>;

const DEFAULT_TIMEOUT_MS = 60_000;

export function isUserPresenceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (typeof navigator === 'undefined') return false;
  return typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export async function enrollUserPresenceUnlock(options: UserPresenceEnrollOptions): Promise<UserPresenceEnrollResult> {
  const credential = await createUserPresenceCredential(options);
  const credentialId = new Uint8Array(credential.rawId);
  const fromCreate = tryExtractPrfOutput(credential);
  if (fromCreate) {
    return { credentialId, userPresenceSecret: fromCreate };
  }
  const userPresenceSecret = await getUserPresenceSecret({
    credentialId,
    prfSalt: options.prfSalt,
    rpId: options.rpId,
    timeoutMs: options.timeoutMs,
  });
  return { credentialId, userPresenceSecret };
}

export async function getUserPresenceSecret(options: UserPresenceSecretOptions): Promise<Uint8Array> {
  const challenge = options.challenge ?? randomBytes(32);
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: toArrayBuffer(challenge),
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    rpId: options.rpId,
    userVerification: 'required',
    allowCredentials: [
      {
        type: 'public-key',
        id: toArrayBuffer(options.credentialId),
      },
    ],
    extensions: buildPrfInputs(options.prfSalt),
  };

  const credential = await navigator.credentials.get({ publicKey });
  const pkCred = requirePublicKeyCredential(credential);
  return extractPrfOutput(pkCred);
}

export function parseUserPresencePrfOutput(results: AuthenticationExtensionsClientOutputs): Uint8Array {
  const prf = (results as PrfExtensionOutputs).prf;
  if (!prf || typeof prf !== 'object') {
    throw new Error('PRF extension results missing');
  }
  const candidate = prf.results?.first ?? prf.first;
  if (!candidate) {
    throw new Error('PRF output missing');
  }
  return toUint8Array(candidate);
}

async function createUserPresenceCredential(options: UserPresenceEnrollOptions): Promise<PrfCredential> {
  if (!isUserPresenceSupported()) {
    throw new Error('WebAuthn user presence not supported in this environment');
  }

  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: {
      name: options.rpName,
      id: options.rpId,
    },
    user: {
      id: toArrayBuffer(options.userId),
      name: options.userName,
      displayName: options.userDisplayName,
    },
    challenge: toArrayBuffer(options.challenge ?? randomBytes(32)),
    pubKeyCredParams: [
      {
        type: 'public-key',
        alg: -7,
      },
    ],
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    authenticatorSelection: {
      userVerification: 'required',
    },
    attestation: 'none',
    extensions: buildPrfInputs(options.prfSalt),
  };

  const credential = await navigator.credentials.create({ publicKey });
  return requirePublicKeyCredential(credential);
}

function extractPrfOutput(credential: PrfCredential): Uint8Array {
  return parseUserPresencePrfOutput(credential.getClientExtensionResults());
}

function tryExtractPrfOutput(credential: PrfCredential): Uint8Array | null {
  try {
    return extractPrfOutput(credential);
  } catch {
    return null;
  }
}

function requirePublicKeyCredential(value: Credential | null): PrfCredential {
  if (!value) {
    throw new Error('No credential returned');
  }
  const candidate = value as Partial<PrfCredential>;
  if (!candidate.rawId || typeof candidate.getClientExtensionResults !== 'function') {
    throw new Error('Expected a public-key credential');
  }
  return candidate as PrfCredential;
}

function buildPrfInputs(salt: Uint8Array): PrfExtensionInputs {
  return {
    prf: {
      eval: {
        first: toArrayBufferView(salt),
      },
    },
  };
}

function randomBytes(len: number): Uint8Array {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto unavailable');
  }
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  return out;
}

function toUint8Array(value: ArrayBuffer): Uint8Array {
  return new Uint8Array(value);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}

function toArrayBufferView(value: Uint8Array): Uint8Array & { buffer: ArrayBuffer } {
  return new Uint8Array(value) as Uint8Array & { buffer: ArrayBuffer };
}
