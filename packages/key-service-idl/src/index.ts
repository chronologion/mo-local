export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type SessionId = Brand<string, 'SessionId'>;
export type KeyHandle = Brand<string, 'KeyHandle'>;

export type UserId = Brand<string, 'UserId'>;
export type DeviceId = Brand<string, 'DeviceId'>;

export type ScopeId = Brand<string, 'ScopeId'>;
export type ResourceId = Brand<string, 'ResourceId'>;

export type ScopeEpoch = Brand<bigint, 'ScopeEpoch'>;
export type ResourceKeyId = Brand<string, 'ResourceKeyId'>;

export type AeadId = 'aead-1';

export type KemCiphersuiteId = 'hybrid-kem-1';
export type SigCiphersuiteId = 'hybrid-sig-1';

export type SessionKind = 'normal' | 'stepUp';
export type SessionAssurance = 'passphrase' | 'userPresence';
export type EmptyObject = Readonly<Record<string, never>>;

export type UnlockRequest =
  | Readonly<{
      method: 'passphrase';
      passphraseUtf8: Uint8Array;
    }>
  | Readonly<{
      method: 'userPresence';
      userPresenceSecret: Uint8Array;
    }>;

export type UnlockResponse = Readonly<{
  sessionId: SessionId;
  issuedAtMs: number;
  expiresAtMs: number;
  kind: SessionKind;
  assurance: SessionAssurance;
}>;

export type KdfParams = Readonly<{
  id: string;
  salt: Uint8Array;
  memoryKib: number;
  iterations: number;
  parallelism: number;
}>;

export type CreateVaultRequest = Readonly<{
  userId: UserId;
  passphraseUtf8: Uint8Array;
  kdfParams: KdfParams;
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

export type GetUserPresenceUnlockInfoResponse = Readonly<{
  enabled: boolean;
  credentialId: Uint8Array | null;
  prfSalt: Uint8Array;
  aead: AeadId;
}>;

export type EnableUserPresenceUnlockRequest = Readonly<{
  sessionId: SessionId;
  credentialId: Uint8Array;
  userPresenceSecret: Uint8Array;
}>;

export type DisableUserPresenceUnlockRequest = Readonly<{
  sessionId: SessionId;
}>;

export type KeyEnvelopeRef = Readonly<{
  scopeId: ScopeId;
  scopeEpoch: ScopeEpoch;
  scopeStateRef: string;
  ciphersuite: KemCiphersuiteId;
}>;

export type ResourceGrantRef = Readonly<{
  grantId: string;
  scopeId: ScopeId;
  scopeEpoch: ScopeEpoch;
  resourceId: ResourceId;
  resourceKeyId: ResourceKeyId;
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

export type StoreAppMasterKeyRequest = Readonly<{
  sessionId: SessionId;
  masterKey: Uint8Array;
}>;

export type GetAppMasterKeyRequest = Readonly<{
  sessionId: SessionId;
}>;

export type GetAppMasterKeyResponse = Readonly<{
  masterKey: Uint8Array;
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
  | Readonly<{ type: 'createVault'; payload: CreateVaultRequest }>
  | Readonly<{ type: 'unlock'; payload: UnlockRequest }>
  | Readonly<{ type: 'stepUp'; payload: StepUpRequest }>
  | Readonly<{ type: 'getUserPresenceUnlockInfo'; payload: EmptyObject }>
  | Readonly<{ type: 'renewSession'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'lock'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'exportKeyVault'; payload: Readonly<{ sessionId: SessionId }> }>
  | Readonly<{ type: 'importKeyVault'; payload: Readonly<{ sessionId: SessionId; blob: Uint8Array }> }>
  | Readonly<{ type: 'changePassphrase'; payload: ChangePassphraseRequest }>
  | Readonly<{ type: 'storeAppMasterKey'; payload: StoreAppMasterKeyRequest }>
  | Readonly<{ type: 'getAppMasterKey'; payload: GetAppMasterKeyRequest }>
  | Readonly<{ type: 'enableUserPresenceUnlock'; payload: EnableUserPresenceUnlockRequest }>
  | Readonly<{ type: 'disableUserPresenceUnlock'; payload: DisableUserPresenceUnlockRequest }>
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
  | Readonly<{ type: 'createVault'; payload: EmptyObject }>
  | Readonly<{ type: 'unlock'; payload: UnlockResponse }>
  | Readonly<{ type: 'stepUp'; payload: StepUpResponse }>
  | Readonly<{ type: 'getUserPresenceUnlockInfo'; payload: GetUserPresenceUnlockInfoResponse }>
  | Readonly<{ type: 'renewSession'; payload: RenewSessionResponse }>
  | Readonly<{ type: 'lock'; payload: EmptyObject }>
  | Readonly<{ type: 'exportKeyVault'; payload: Readonly<{ blob: Uint8Array }> }>
  | Readonly<{ type: 'importKeyVault'; payload: EmptyObject }>
  | Readonly<{ type: 'changePassphrase'; payload: EmptyObject }>
  | Readonly<{ type: 'storeAppMasterKey'; payload: EmptyObject }>
  | Readonly<{ type: 'getAppMasterKey'; payload: GetAppMasterKeyResponse }>
  | Readonly<{ type: 'enableUserPresenceUnlock'; payload: EmptyObject }>
  | Readonly<{ type: 'disableUserPresenceUnlock'; payload: EmptyObject }>
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
