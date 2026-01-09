export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type SessionId = Brand<string, 'SessionId'>;
export type KeyHandle = Brand<string, 'KeyHandle'>;

export type UserId = Brand<string, 'UserId'>;
export type DeviceId = Brand<string, 'DeviceId'>;

export type ScopeId = Brand<string, 'ScopeId'>;
export type ResourceId = Brand<string, 'ResourceId'>;

export type ScopeEpoch = Brand<number, 'ScopeEpoch'>;
export type ResourceKeyId = Brand<string, 'ResourceKeyId'>;

export type AeadId = 'aead-1';

export type KemCiphersuiteId = 'hybrid-kem-1';
export type SigCiphersuiteId = 'hybrid-sig-1';

export type SessionKind = 'normal' | 'stepUp';
export type SessionAssurance = 'passphrase' | 'webauthnPrf';
export type EmptyObject = Readonly<Record<string, never>>;

export type UnlockRequest =
  | Readonly<{
      method: 'passphrase';
      passphraseUtf8: Uint8Array;
    }>
  | Readonly<{
      method: 'webauthnPrf';
      prfOutput: Uint8Array;
    }>;

export type UnlockResponse = Readonly<{
  sessionId: SessionId;
  issuedAtMs: number;
  expiresAtMs: number;
  kind: SessionKind;
  assurance: SessionAssurance;
}>;

export type StepUpRequest = Readonly<{
  sessionId: SessionId;
  passphraseUtf8: Uint8Array;
}>;

export type StepUpResponse = Readonly<{
  issuedAtMs: number;
  expiresAtMs: number;
  kind: 'stepUp';
  assurance: 'passphrase';
}>;

export type RenewSessionResponse = Readonly<{
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export type GetWebAuthnPrfUnlockInfoResponse = Readonly<{
  enabled: boolean;
  credentialId: Uint8Array | null;
  prfSalt: Uint8Array;
  aead: AeadId;
}>;

export type EnableWebAuthnPrfUnlockRequest = Readonly<{
  sessionId: SessionId;
  credentialId: Uint8Array;
  prfOutput: Uint8Array;
}>;

export type DisableWebAuthnPrfUnlockRequest = Readonly<{
  sessionId: SessionId;
}>;

export type IngestScopeStateRequest = Readonly<{
  sessionId: SessionId;
  scopeStateCbor: Uint8Array;
  expectedOwnerSignerFingerprint: string | null;
}>;

export type IngestScopeStateResponse = Readonly<{
  scopeId: ScopeId;
  scopeStateRef: string;
}>;

export type IngestKeyEnvelopeRequest = Readonly<{
  sessionId: SessionId;
  keyEnvelopeCbor: Uint8Array;
}>;

export type IngestKeyEnvelopeResponse = Readonly<{
  scopeId: ScopeId;
  scopeEpoch: ScopeEpoch;
}>;

export type OpenResourceRequest = Readonly<{
  sessionId: SessionId;
  scopeKeyHandle: KeyHandle;
  grantCbor: Uint8Array;
}>;

export type CloseHandleRequest = Readonly<{
  sessionId: SessionId;
  keyHandle: KeyHandle;
}>;

export type ChangePassphraseRequest = Readonly<{
  sessionId: SessionId;
  newPassphraseUtf8: Uint8Array;
}>;

export type EncryptRequest = Readonly<{
  sessionId: SessionId;
  resourceKeyHandle: KeyHandle;
  aad: Uint8Array;
  plaintext: Uint8Array;
}>;

export type EncryptResponse = Readonly<{ ciphertext: Uint8Array }>;

export type DecryptRequest = Readonly<{
  sessionId: SessionId;
  resourceKeyHandle: KeyHandle;
  aad: Uint8Array;
  ciphertext: Uint8Array;
}>;

export type DecryptResponse = Readonly<{ plaintext: Uint8Array }>;

export type SignRequest = Readonly<{
  sessionId: SessionId;
  data: Uint8Array;
}>;

export type SignResponse = Readonly<{
  signature: Uint8Array;
  ciphersuite: SigCiphersuiteId;
}>;

export type VerifyRequest = Readonly<{
  scopeId: ScopeId;
  signerDeviceId: DeviceId;
  data: Uint8Array;
  signature: Uint8Array;
  ciphersuite: SigCiphersuiteId;
}>;

export type VerifyResponse = Readonly<{ ok: boolean }>;

export type SignalRequest = Readonly<{
  signal: 'idle' | 'blur' | 'lock';
  sessionId?: SessionId;
}>;

export type KeyServiceRequest =
  | Readonly<{ type: 'unlock'; payload: UnlockRequest }>
  | Readonly<{ type: 'stepUp'; payload: StepUpRequest }>
  | Readonly<{ type: 'getWebAuthnPrfUnlockInfo'; payload: EmptyObject }>
  | Readonly<{ type: 'renewSession'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'lock'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'exportKeyVault'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'importKeyVault'; payload: Readonly<{ sessionId: SessionId; blob: Uint8Array }> }>
  | Readonly<{ type: 'changePassphrase'; payload: ChangePassphraseRequest }>
  | Readonly<{ type: 'enableWebAuthnPrfUnlock'; payload: EnableWebAuthnPrfUnlockRequest }>
  | Readonly<{ type: 'disableWebAuthnPrfUnlock'; payload: DisableWebAuthnPrfUnlockRequest }>
  | Readonly<{ type: 'ingestScopeState'; payload: IngestScopeStateRequest }>
  | Readonly<{ type: 'ingestKeyEnvelope'; payload: IngestKeyEnvelopeRequest }>
  | Readonly<{
      type: 'openScope';
      payload: Readonly<{ sessionId: SessionId; scopeId: ScopeId; scopeEpoch: ScopeEpoch }>;
    }>
  | Readonly<{ type: 'openResource'; payload: OpenResourceRequest }>
  | Readonly<{ type: 'closeHandle'; payload: CloseHandleRequest }>
  | Readonly<{ type: 'encrypt'; payload: EncryptRequest }>
  | Readonly<{ type: 'decrypt'; payload: DecryptRequest }>
  | Readonly<{ type: 'sign'; payload: SignRequest }>
  | Readonly<{ type: 'verify'; payload: VerifyRequest }>
  | Readonly<{ type: 'signal'; payload: SignalRequest }>;

export type KeyServiceResponse =
  | Readonly<{ type: 'unlock'; payload: UnlockResponse }>
  | Readonly<{ type: 'stepUp'; payload: StepUpResponse }>
  | Readonly<{ type: 'getWebAuthnPrfUnlockInfo'; payload: GetWebAuthnPrfUnlockInfoResponse }>
  | Readonly<{ type: 'renewSession'; payload: RenewSessionResponse }>
  | Readonly<{ type: 'lock'; payload: EmptyObject }>
  | Readonly<{ type: 'exportKeyVault'; payload: Readonly<{ blob: Uint8Array }> }>
  | Readonly<{ type: 'importKeyVault'; payload: EmptyObject }>
  | Readonly<{ type: 'changePassphrase'; payload: EmptyObject }>
  | Readonly<{ type: 'enableWebAuthnPrfUnlock'; payload: EmptyObject }>
  | Readonly<{ type: 'disableWebAuthnPrfUnlock'; payload: EmptyObject }>
  | Readonly<{ type: 'ingestScopeState'; payload: IngestScopeStateResponse }>
  | Readonly<{ type: 'ingestKeyEnvelope'; payload: IngestKeyEnvelopeResponse }>
  | Readonly<{ type: 'openScope'; payload: Readonly<{ scopeKeyHandle: KeyHandle }> }>
  | Readonly<{ type: 'openResource'; payload: Readonly<{ resourceKeyHandle: KeyHandle }> }>
  | Readonly<{ type: 'closeHandle'; payload: EmptyObject }>
  | Readonly<{ type: 'encrypt'; payload: EncryptResponse }>
  | Readonly<{ type: 'decrypt'; payload: DecryptResponse }>
  | Readonly<{ type: 'sign'; payload: SignResponse }>
  | Readonly<{ type: 'verify'; payload: VerifyResponse }>
  | Readonly<{ type: 'signal'; payload: EmptyObject }>;

export const KeyServiceErrorCodes = {
  StorageError: 'StorageError',
  InvalidCbor: 'InvalidCbor',
  InvalidFormat: 'InvalidFormat',
  CryptoError: 'CryptoError',
  SessionInvalid: 'SessionInvalid',
  StepUpRequired: 'StepUpRequired',
  UntrustedSigner: 'UntrustedSigner',
  UnknownScope: 'UnknownScope',
  UnknownHandle: 'UnknownHandle',
  ResourceKeyMissing: 'ResourceKeyMissing',
  ScopeKeyMissing: 'ScopeKeyMissing',
  FingerprintMismatch: 'FingerprintMismatch',
  SignerFingerprintRequired: 'SignerFingerprintRequired',
  WorkerProtocolError: 'WorkerProtocolError',
  WorkerNotReady: 'WorkerNotReady',
  WasmError: 'WasmError',
} as const;

export type KeyServiceErrorCode = (typeof KeyServiceErrorCodes)[keyof typeof KeyServiceErrorCodes];

export type KeyServiceError = Readonly<{
  code: KeyServiceErrorCode;
  message: string;
  context?: Readonly<Record<string, unknown>>;
}>;

export const WorkerEnvelopeKinds = {
  request: 'request',
  response: 'response',
} as const;

export type WorkerEnvelopeKind = (typeof WorkerEnvelopeKinds)[keyof typeof WorkerEnvelopeKinds];

export type WorkerEnvelope =
  | Readonly<{
      v: 1;
      kind: typeof WorkerEnvelopeKinds.request;
      requestId: string;
      payload: KeyServiceRequest;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerEnvelopeKinds.response;
      requestId: string;
      payload: WorkerResponse;
    }>;

export const WorkerHelloKinds = {
  hello: 'hello',
  helloOk: 'hello.ok',
  helloError: 'hello.error',
} as const;

export type WorkerHelloKind = (typeof WorkerHelloKinds)[keyof typeof WorkerHelloKinds];

export type WorkerHello =
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.hello;
      storeId: string;
      clientInstanceId: string;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.helloOk;
      protocolVersion: 1;
      serverInstanceId: string;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.helloError;
      error: KeyServiceError;
    }>;

export const WorkerResponseKinds = {
  ok: 'ok',
  error: 'error',
} as const;

export type WorkerResponseKind = (typeof WorkerResponseKinds)[keyof typeof WorkerResponseKinds];

export type WorkerResponse =
  | Readonly<{ kind: typeof WorkerResponseKinds.ok; data: KeyServiceResponse }>
  | Readonly<{ kind: typeof WorkerResponseKinds.error; error: KeyServiceError }>;
