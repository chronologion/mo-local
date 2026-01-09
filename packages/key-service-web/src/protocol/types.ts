export type {
  AeadId,
  Brand,
  ChangePassphraseRequest,
  CloseHandleRequest,
  CreateVaultRequest,
  DecryptRequest,
  DecryptResponse,
  DeviceId,
  DisableUserPresenceUnlockRequest,
  EncryptRequest,
  EncryptResponse,
  EnableUserPresenceUnlockRequest,
  GetUserPresenceUnlockInfoResponse,
  IngestKeyEnvelopeRequest,
  IngestKeyEnvelopeResponse,
  IngestScopeStateRequest,
  IngestScopeStateResponse,
  KdfParams,
  KemCiphersuiteId,
  KeyHandle,
  KeyEnvelopeRef,
  KeyServiceRequest,
  KeyServiceResponse,
  OpenResourceRequest,
  RenewSessionResponse,
  ResourceId,
  ResourceGrantRef,
  ResourceKeyId,
  ScopeEpoch,
  ScopeId,
  SessionAssurance,
  SessionId,
  SessionKind,
  SigCiphersuiteId,
  SignRequest,
  SignResponse,
  SignalRequest,
  StepUpRequest,
  StepUpResponse,
  UnlockRequest,
  UnlockResponse,
  UserId,
  VerifyRequest,
  VerifyResponse,
} from '@mo/key-service-idl';

import type { KeyServiceRequest, KeyServiceResponse } from '@mo/key-service-idl';

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
  helloOk: 'helloOk',
  helloError: 'helloError',
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
